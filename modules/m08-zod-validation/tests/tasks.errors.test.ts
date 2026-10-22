// M09 — every error path the contract froze. Two rules hold throughout:
//   * byte-exact wire strings (the m07/m08 message literals — if an assertion
//     here fails, either the contract changed or the test is wrong; nothing
//     may drift "a little"), and
//   * the envelope shape: { error: { code, message, details?, requestId } },
//     details ONLY on validation errors, never a stack trace anywhere.

import { describe, expect, it, beforeEach } from "@jest/globals";
import request from "supertest";
import { makeTestApp } from "./helpers/app.ts";
import { resetDatabase } from "./helpers/db.ts";
import { createTaskRow } from "./helpers/factories.ts";

const app = makeTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("POST validation — 400 with field-level details", () => {
  it("missing title → the frozen create-context message", async () => {
    const res = await request(app).post("/api/v1/tasks").send({ description: "x" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Request validation failed");
    expect(res.body.error.details).toEqual([
      { path: "title", message: "Required, non-empty string" },
    ]);
    expect(res.body.error.requestId).toBeDefined();
  });

  it("blank title → rejected after trim", async () => {
    const res = await request(app).post("/api/v1/tasks").send({ title: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "title", message: "Required, non-empty string" },
    ]);
  });

  it("unknown status → the enum message with the full list", async () => {
    const res = await request(app).post("/api/v1/tasks").send({ title: "t", status: "bogus" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "status", message: "Must be one of: todo, in_progress, done" },
    ]);
  });

  it("non-string description → the create-context message", async () => {
    const res = await request(app).post("/api/v1/tasks").send({ title: "t", description: 42 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "description", message: "Must be a string when present" },
    ]);
  });

  it("non-object body (array) → whole-body message at path ''", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send("[1,2]");

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "", message: "Body must be a JSON object" },
    ]);
  });

  it("create tolerates unknown keys (m07 parity: stripped, not rejected)", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .send({ title: "with junk", bogus: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.bogus).toBeUndefined();
    expect(res.body.data.title).toBe("with junk");
  });
});

describe("PATCH validation — m07's mutually-exclusive error classes", () => {
  it("empty patch → only the cross-field message", async () => {
    const row = await createTaskRow({ title: "target" });
    const res = await request(app).patch(`/api/v1/tasks/${row.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "", message: "At least one of title, description, status is required" },
    ]);
  });

  it("unknown key alone → ONLY 'Unknown field' (no spurious empty-patch detail)", async () => {
    const row = await createTaskRow({ title: "target" });
    const res = await request(app).patch(`/api/v1/tasks/${row.id}`).send({ foo: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "foo", message: "Unknown field" }]);
  });

  it("mixed unknown key + bad field → unknown key FIRST, then the field", async () => {
    const row = await createTaskRow({ title: "target" });
    const res = await request(app)
      .patch(`/api/v1/tasks/${row.id}`)
      .send({ foo: 1, title: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "foo", message: "Unknown field" },
      { path: "title", message: "Must be a non-empty string" }, // PATCH wording
    ]);
  });

  it("blank title → PATCH-context wording, not the create wording", async () => {
    const row = await createTaskRow({ title: "target" });
    const res = await request(app).patch(`/api/v1/tasks/${row.id}`).send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "title", message: "Must be a non-empty string" },
    ]);
  });

  it("non-string description → PATCH-context wording", async () => {
    const row = await createTaskRow({ title: "target" });
    const res = await request(app).patch(`/api/v1/tasks/${row.id}`).send({ description: 42 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "description", message: "Must be a string" },
    ]);
  });
});

describe("route params", () => {
  it("non-UUID id → 400 with the frozen uuid message", async () => {
    const res = await request(app).get("/api/v1/tasks/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "id", message: "Must be a UUID" }]);
  });

  it("hex-shaped but non-RFC id passes the gate → 404, not 400 (m07 parity)", async () => {
    const res = await request(app).get("/api/v1/tasks/00000000-0000-9000-8000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("404s", () => {
  it("unknown id → Task <id> not found", async () => {
    const id = "00000000-0000-4000-8000-000000000999";
    const res = await request(app).get(`/api/v1/tasks/${id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: `Task ${id} not found`,
    });
    expect(res.body.error.details).toBeUndefined();
  });

  it("PATCH of an unknown id (free title) → 404", async () => {
    const id = "00000000-0000-4000-8000-000000000999";
    const res = await request(app).patch(`/api/v1/tasks/${id}`).send({ title: "new name" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe(`Task ${id} not found`);
  });

  it("DELETE of an unknown id → 404", async () => {
    const id = "00000000-0000-4000-8000-000000000999";
    const res = await request(app).delete(`/api/v1/tasks/${id}`);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe(`Task ${id} not found`);
  });
});

describe("409 — unique-constraint violations", () => {
  it("POST duplicate title → Conflict with the frozen message", async () => {
    await createTaskRow({ title: "already here" });

    const res = await request(app).post("/api/v1/tasks").send({ title: "already here" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "CONFLICT",
      message: 'A task with title "already here" already exists',
    });
  });

  it("PATCH onto another task's title → 409", async () => {
    await createTaskRow({ title: "taken" });
    const other = await createTaskRow({ title: "mine" });

    const res = await request(app).patch(`/api/v1/tasks/${other.id}`).send({ title: "taken" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('A task with title "taken" already exists');
  });

  it("PATCH a missing id WITH a taken title → 409 (v1 checked clash BEFORE existence)", async () => {
    await createTaskRow({ title: "taken" });
    const missing = "00000000-0000-4000-8000-000000000999";

    const res = await request(app).patch(`/api/v1/tasks/${missing}`).send({ title: "taken" });

    expect(res.status).toBe(409); // NOT 404 — the order is frozen v1 behaviour
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("PATCH a missing id with a free title → 404 (the other branch)", async () => {
    const missing = "00000000-0000-4000-8000-000000000999";

    const res = await request(app)
      .patch(`/api/v1/tasks/${missing}`)
      .send({ title: "free name" });

    expect(res.status).toBe(404);
  });
});

describe("malformed JSON", () => {
  it("broken body → 400 validation envelope, never 500, never leaked parser internals", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send('{"title": ');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Body must be valid JSON",
    });
    expect(res.body.error.details).toBeUndefined(); // body never parsed — no field path
    expect(res.body.error.requestId).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/stack|SyntaxError|JSON input/);
  });
});

describe("list query gate — m07's int gate, char for char", () => {
  it.each([
    ["page=007"], // leading zero — v1 regex rejected
    ["page=1e3"], // scientific notation — v1 regex rejected
    ["page=0"], // zero — not positive
    ["page=abc"], // non-numeric
  ])("?%s → 400 'Must be a positive integer'", async (query) => {
    const res = await request(app).get(`/api/v1/tasks?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "page", message: "Must be a positive integer" },
    ]);
  });

  it("?pageSize=101 → 400 with the range message", async () => {
    const res = await request(app).get("/api/v1/tasks?pageSize=101");

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: "pageSize", message: "Must be an integer between 1 and 100" },
    ]);
  });

  it("repeated param (?status=a&status=b) → 'Must not be repeated', not silent drop", async () => {
    const res = await request(app).get("/api/v1/tasks?status=todo&status=done");

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "status", message: "Must not be repeated" }]);
  });

  it("collects status + sort + order + page errors into ONE 400 (Bruno parity)", async () => {
    const res = await request(app).get(
      "/api/v1/tasks?status=bogus&sort=bogus&order=sideways&page=nope",
    );

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: "status", message: "Must be one of: todo, in_progress, done" },
        { path: "sort", message: "Must be one of: createdAt, title, dueDate" },
        { path: "order", message: "Must be one of: asc, desc" },
        { path: "page", message: "Must be a positive integer" },
      ]),
    );
    expect(res.body.error.details).toHaveLength(4);
  });
});
