// M09 — middleware behaviour as a CLIENT sees it. The rule these tests hold:
// observable contract only (headers, envelope shapes, what must NOT appear in
// a body). The one mock in the file is a jest.spyOn on the service — mocking
// AT A BOUNDARY (the handler's collaborator) to force a programmer error;
// the database itself is never mocked.

import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import request from "supertest";
import { makeTestApp } from "./helpers/app.ts";
import { resetDatabase } from "./helpers/db.ts";
import { createTaskRow } from "./helpers/factories.ts";
import { TaskService } from "../src/services/task-service.ts";

const app = makeTestApp();

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  jest.restoreAllMocks(); // boundary spy is per-test; nothing lingers into the next
});

describe("request-ID middleware", () => {
  it("sets x-request-id on successful responses when the client sent none", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("echoes an inbound x-request-id instead of replacing it", async () => {
    const res = await request(app).get("/health").set("x-request-id", "trace-abc-123");

    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
  });

  it("sets x-request-id on ERROR responses too", async () => {
    const res = await request(app).get("/api/v1/tasks/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("puts the inbound id inside the error envelope body", async () => {
    const res = await request(app)
      .get("/api/v1/tasks/00000000-0000-4000-8000-000000000999")
      .set("x-request-id", "trace-err-456");

    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBe("trace-err-456");
  });
});

describe("404 handler — unmatched routes", () => {
  it("funnels into the central envelope with method + path in the message", async () => {
    const res = await request(app).get("/api/v1/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Route GET /api/v1/nonexistent not found",
    });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("applies to unknown METHODS as well (POST on a read-only path)", async () => {
    const res = await request(app).post("/health").send({});

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Route POST /health not found");
  });
});

describe("central error handler — leaks nothing", () => {
  it("a thrown programmer error → 500 envelope with NO stack, no file paths", async () => {
    const row = await createTaskRow({ title: "victim" });
    // The sanctioned mock: spy on the BOUNDARY collaborator to force the
    // failure a real bug would raise. Nothing about the database is faked.
    jest.spyOn(TaskService.prototype, "getById").mockRejectedValueOnce(
      // Deliberately path-free message: the handler echoes err.message in
      // non-production BY DESIGN, so the assertions below prove only that the
      // STACK (its "src/…ts:NN" frames) never reaches the client.
      new Error("unexpected failure in the service layer"),
    );

    const res = await request(app).get(`/api/v1/tasks/${row.id}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.requestId).toBeDefined();

    const raw = JSON.stringify(res.body);
    expect(res.body.error.stack).toBeUndefined();
    expect(raw).not.toContain("stack");
    expect(raw).not.toContain(".ts:"); // stack frames name files — none may appear
    expect(raw).not.toContain("src/"); // a leaked stack would point here
  });
});
