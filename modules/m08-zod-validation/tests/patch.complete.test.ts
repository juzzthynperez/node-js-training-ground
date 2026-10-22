// M09 TDD — PATCH /tasks/:id/complete, written BEFORE the endpoint exists.
//
// Red → green → refactor, in that order:
//   1. this file runs first and FAILS because the route does not exist yet
//      (evidence/m09/tdd-red.txt — 404 "Route PATCH … not found" is the
//      intended failure: the endpoint is genuinely absent),
//   2. only then is the handler + service method written (evidence/m09/tdd-green.txt),
//   3. then regression tests for the failure paths are added (bottom of this
//      file) and the whole file goes green again.
//
// Behaviour this endpoint promises: an existing task's status becomes "done",
// answering 200 with the updated task; unknown ids 404 via the same Prisma
// error seam as every other write; ids that are not UUIDs never reach it (the
// params gate answers 400); re-completing is idempotent — completing a
// completed task is not an error, it is the same request again.

import { describe, expect, it, beforeEach } from "@jest/globals";
import request from "supertest";
import { makeTestApp } from "./helpers/app.ts";
import { resetDatabase } from "./helpers/db.ts";
import { createTaskRow } from "./helpers/factories.ts";

const app = makeTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("PATCH /api/v1/tasks/:id/complete", () => {
  it("marks an existing task done and returns the updated task", async () => {
    const row = await createTaskRow({ title: "finish me", status: "in_progress" });

    const res = await request(app).patch(`/api/v1/tasks/${row.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: row.id,
      title: "finish me",
      status: "done",
      priority: "medium",
    });
  });

  // ---- regression cases (added AFTER the implementation went green) ----

  it("is idempotent: completing a done task answers 200 again", async () => {
    const row = await createTaskRow({ title: "already done", status: "done" });

    const res = await request(app).patch(`/api/v1/tasks/${row.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("done");
  });

  it("leaves fields the endpoint does not own untouched", async () => {
    const row = await createTaskRow({
      title: "keep title",
      description: "keep description",
      status: "todo",
    });

    const res = await request(app).patch(`/api/v1/tasks/${row.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: "keep title",
      description: "keep description",
      status: "done",
    });
  });

  it("unknown id → 404 through the standard Prisma error seam", async () => {
    const missing = "00000000-0000-4000-8000-000000000999";

    const res = await request(app).patch(`/api/v1/tasks/${missing}/complete`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: `Task ${missing} not found`,
    });
  });

  it("non-UUID id → 400 at the params gate, handler never runs", async () => {
    const res = await request(app).patch("/api/v1/tasks/nope/complete");

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "id", message: "Must be a UUID" }]);
  });
});
