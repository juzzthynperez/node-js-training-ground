// Skeleton-stage proof: the app builds and serves /health in-process.
// (Feature suites join as their branches land — auth, CRUD/list, loans.)

import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { makeTestApp } from "./helpers/app.ts";

describe("health", () => {
  it("GET /health answers 200 with status ok", async () => {
    const app = makeTestApp();
    await request(app)
      .get("/health")
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ status: "ok", uptime: expect.any(Number) });
      });
  });

  it("rejects a malformed JSON body with 400-safe parsing (no crash)", async () => {
    const app = makeTestApp();
    // Before the error contract lands, Express's default handler answers —
    // the assertion is only that the process survives garbage input.
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
