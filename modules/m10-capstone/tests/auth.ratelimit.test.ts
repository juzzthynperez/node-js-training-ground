// feat(auth-guard) verification — rate limiting LIVE on the auth endpoints:
// a fresh app built with RATE_LIMIT_MAX=3 trips after three requests, answers
// the shared envelope (not the library's plaintext default), shares one
// budget across register+login, sits BEFORE validation, and — the scope
// proof — leaves every other endpoint open.
//
// The env is mutated AROUND buildApp(): loadConfig() reads process.env at
// call time and makeAuthRouter snapshots it into the limiter at build time,
// so each test's app carries its own budget. Restored in afterEach so no
// other suite inherits a tiny ceiling.

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { loadConfig } from "../src/config.ts";
import { buildApp } from "../src/app.ts";
import { resetDatabase } from "./helpers/db.ts";

const saved = {
  RATE_LIMIT_MAX: process.env["RATE_LIMIT_MAX"],
  RATE_LIMIT_WINDOW_MS: process.env["RATE_LIMIT_WINDOW_MS"],
};

function makeRateLimitedApp(max = "3"): ReturnType<typeof buildApp> {
  process.env["RATE_LIMIT_MAX"] = max;
  process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
  return buildApp(loadConfig());
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  process.env["RATE_LIMIT_MAX"] = saved.RATE_LIMIT_MAX;
  process.env["RATE_LIMIT_WINDOW_MS"] = saved.RATE_LIMIT_WINDOW_MS;
});

const VALID_REGISTER = { name: "Sparrow", email: "sparrow@library.test", password: "wing-span-77" };

describe("rate limiting on /api/v1/auth (live)", () => {
  it("allows exactly the configured max, then answers 429 in the shared envelope", async () => {
    const app = makeRateLimitedApp("3");

    // Budget 3: three registrations succeed.
    for (const suffix of ["1", "2", "3"]) {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ ...VALID_REGISTER, email: `racer-${suffix}@library.test` });
      expect(res.status).toBe(201);
    }

    // The fourth trips the limiter — with a valid body, so the 429 cannot be
    // a validation answer in disguise.
    const trip = await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER });
    expect(trip.status).toBe(429);
    expect(trip.body.error.code).toBe("RATE_LIMITED");
    expect(typeof trip.body.error.requestId).toBe("string");
    expect(Object.keys(trip.body)).toEqual(["error"]);
    // The draft headers are present too (observable to clients/proxies).
    const headerKeys = Object.keys(trip.headers).filter((k) => k.startsWith("ratelimit"));
    expect(headerKeys.length).toBeGreaterThan(0);
  });

  it("shares one budget across register AND login (both credential endpoints)", async () => {
    const app = makeRateLimitedApp("3");

    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "a@library.test" });
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "b@library.test" });
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "c@library.test" });

    // Login is a DIFFERENT route on the same limiter — still 429.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "a@library.test", password: "wing-span-77" });
    expect(login.status).toBe(429);
    expect(login.body.error.code).toBe("RATE_LIMITED");
  });

  it("the limiter runs BEFORE schema validation (tripped 400s answer 429)", async () => {
    const app = makeRateLimitedApp("2");
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "x@library.test" });
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "y@library.test" });

    // Body fails the schema (password too short) — but the limiter is closer
    // to the door than validate(), so the answer is 429, not 400.
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Late", email: "late@library.test", password: "x" });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("scope: while auth endpoints are tripped, everything else stays open", async () => {
    const app = makeRateLimitedApp("2");
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "s1@library.test" });
    await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER, email: "s2@library.test" });

    const tripped = await request(app).post("/api/v1/auth/register").send({ ...VALID_REGISTER });
    expect(tripped.status).toBe(429);

    // Health is untouched — the limit is scoped to the two auth routes.
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
  });

  it("with the default test ceiling the endpoints are NOT limited", async () => {
    // RATE_LIMIT_MAX=1000 (forced by setup-env) — five requests are nowhere
    // near it; proves normal suites are never rate-limited by accident.
    const app = buildApp(loadConfig());
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ ...VALID_REGISTER, email: `plenty-${i}@library.test` });
      expect(res.status).toBe(201);
    }
  });
});
