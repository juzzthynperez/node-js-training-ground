// M09 — happy paths across every endpoint, against the real app + real
// test.db. Arrange–Act–Assert in order; assertions pin the FROZEN wire
// contract (status codes, envelope shape, field presence/omission), never
// internal implementation.

import { describe, expect, it, beforeEach } from "@jest/globals";
import request from "supertest";
import { makeTestApp } from "./helpers/app.ts";
import { resetDatabase, countTasks } from "./helpers/db.ts";
import { createTaskRow, seedTasks, sequencedDate } from "./helpers/factories.ts";

const app = makeTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /health", () => {
  it("answers 200 with the operational payload", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("POST /api/v1/tasks", () => {
  it("creates a task: 201, Location header, service-decided defaults", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .send({ title: "Write integration tests" });

    expect(res.status).toBe(201);
    expect(res.headers["location"]).toBe(`/api/v1/tasks/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      title: "Write integration tests",
      status: "todo", // schema default
      priority: "medium", // service policy — never client-supplied
      dueDate: null,
    });
    expect(res.body.data.description).toBeUndefined(); // empty → omitted
    expect(await countTasks()).toBe(1); // persisted, not just echoed
  });

  it("accepts description and status, trims the title", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .send({ title: "  spaced title  ", description: "with detail", status: "in_progress" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "spaced title",
      description: "with detail",
      status: "in_progress",
    });
  });
});

describe("GET /api/v1/tasks/:id", () => {
  it("returns the stored task", async () => {
    const row = await createTaskRow({ title: "fetch me", description: "detail" });

    const res = await request(app).get(`/api/v1/tasks/${row.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: row.id,
      title: "fetch me",
      description: "detail",
      status: "todo",
      priority: "medium",
      dueDate: null,
    });
  });
});

describe("GET /api/v1/tasks", () => {
  it("lists with data + meta, defaulting to page 1 / pageSize 20 / createdAt desc", async () => {
    await seedTasks(3);

    const res = await request(app).get("/api/v1/tasks");

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    expect(res.body.data).toHaveLength(3);
    // createdAt desc with id-asc tiebreak: newest first
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual([
      "task-002",
      "task-001",
      "task-000",
    ]);
  });

  it("paginates: slice, meta counts, and a stable second page", async () => {
    await seedTasks(5);

    const res = await request(app).get("/api/v1/tasks?page=2&pageSize=2");

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual([
      "task-002",
      "task-001", // createdAt desc: index 2 then 1
    ]);
  });

  it("filters by status", async () => {
    await seedTasks(3); // statuses: todo, in_progress, done

    const res = await request(app).get("/api/v1/tasks?status=done");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("task-002");
    expect(res.body.meta.total).toBe(1);
  });

  it("filters by q against title", async () => {
    await seedTasks(5);

    const res = await request(app).get("/api/v1/tasks?q=task-003");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("task-003");
  });

  it("sorts by title ascending", async () => {
    await seedTasks(4);

    const res = await request(app).get("/api/v1/tasks?sort=title&order=asc");

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual([
      "task-000",
      "task-001",
      "task-002",
      "task-003",
    ]);
  });

  it("returns an empty data array with meta when nothing matches", async () => {
    const res = await request(app).get("/api/v1/tasks");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  });

  it("treats an empty query value as absent (no filter, no error)", async () => {
    await seedTasks(2);

    const res = await request(app).get("/api/v1/tasks?status=&q=&page=&pageSize=");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("PATCH /api/v1/tasks/:id", () => {
  it("updates provided fields and leaves the rest untouched", async () => {
    const row = await createTaskRow({ title: "before", description: "keep me" });

    const res = await request(app)
      .patch(`/api/v1/tasks/${row.id}`)
      .send({ title: "after", status: "done" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: row.id,
      title: "after",
      description: "keep me",
      status: "done",
      priority: "medium",
    });
  });
});

describe("DELETE /api/v1/tasks/:id", () => {
  it("deletes: 204 and the row is gone for good", async () => {
    const row = await createTaskRow({ title: "doomed" });

    const res = await request(app).delete(`/api/v1/tasks/${row.id}`);

    expect(res.status).toBe(204);
    expect(await countTasks()).toBe(0); // persisted effect, verified in the DB
  });
});

describe("dueDate rendering", () => {
  it("round-trips a stored due date as an ISO string", async () => {
    const due = sequencedDate(0);
    const row = await createTaskRow({ title: "dated", dueDate: due });

    const res = await request(app).get(`/api/v1/tasks/${row.id}`);

    expect(res.body.data.dueDate).toBe(due.toISOString());
  });
});
