// feat(auth-guard) verification — the two gates proven as distinct answers:
// 401 (credential unusable) vs 403 (authenticated, wrong role). Tokens come
// from the REAL login endpoint (and, for the librarian, a DB-provisioned row —
// the production trust boundary), so nothing here signs its way past the
// checks it is testing. Full chain: requestId → json → requireAuth →
// requireRole → handler → central envelope.

import { beforeEach, describe, expect, it } from "@jest/globals";
import express, { type Express } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { loadConfig } from "../src/config.ts";
import { errorHandlerFactory } from "../src/middleware/error-handler.ts";
import { requireAuth, requireRole } from "../src/middleware/auth.ts";
import { notFound } from "../src/middleware/not-found.ts";
import { requestId } from "../src/middleware/request-id.ts";
import { buildApp } from "../src/app.ts";
import { createUserRow, resetDatabase } from "./helpers/db.ts";

const config = loadConfig();

/** Probe app: the real middleware chain around two protected routes. */
function buildGuardApp(): Express {
  const app = express();
  app.use(requestId);
  app.use(express.json());

  app.get("/member-only", requireAuth(config), (req, res) => {
    res.status(200).json({ userId: req.user?.userId, role: req.user?.role });
  });

  app.get("/librarian-only", requireAuth(config), requireRole("LIBRARIAN"), (req, res) => {
    res.status(200).json({ userId: req.user?.userId, role: req.user?.role });
  });

  app.use(notFound);
  app.use(errorHandlerFactory({ isProduction: config.isProduction }));
  return app;
}

/** Real registration → real token. */
async function registerMember(): Promise<string> {
  const res = await request(buildApp(config))
    .post("/api/v1/auth/register")
    .send({ name: "Guard Member", email: "guard-member@library.test", password: "guard-pass-12" });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

/** DB-provisioned librarian (seed path) → real login → real token. */
async function loginLibrarian(): Promise<string> {
  await createUserRow({
    name: "Guard Librarian",
    email: "guard-librarian@library.test",
    password: "librarian-pass-9",
    role: "LIBRARIAN",
  });
  const res = await request(buildApp(config))
    .post("/api/v1/auth/login")
    .send({ email: "guard-librarian@library.test", password: "librarian-pass-9" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("requireAuth — 401 for every unusable credential", () => {
  it("no Authorization header → 401 UNAUTHORIZED envelope", async () => {
    const res = await request(buildGuardApp()).get("/member-only");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message", "requestId"]);
  });

  it("non-Bearer scheme → 401", async () => {
    const res = await request(buildGuardApp()).get("/member-only").set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("tampered signature → 401 (verified, not decoded)", async () => {
    const token = await registerMember();
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const res = await request(buildGuardApp()).get("/member-only").set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("expired token → 401", async () => {
    const expired = jwt.sign({ sub: "someone", role: "MEMBER" }, config.jwtSecret, { expiresIn: -60 });
    const res = await request(buildGuardApp()).get("/member-only").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("token signed with a different secret → 401 (forgery attempt)", async () => {
    const forged = jwt.sign({ sub: "admin-phantom", role: "LIBRARIAN" }, "attacker-controlled-secret-0123456789abcd", {
      expiresIn: "15m",
    });
    const res = await request(buildGuardApp()).get("/librarian-only").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("valid member token → 200 with the verified identity", async () => {
    const token = await registerMember();
    const res = await request(buildGuardApp()).get("/member-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("MEMBER");
    expect(typeof res.body.userId).toBe("string");
  });
});

describe("requireRole — 403 is an authorization answer, not a login problem", () => {
  it("MEMBER on a LIBRARIAN-only route → 403 FORBIDDEN envelope", async () => {
    const token = await registerMember();
    const res = await request(buildGuardApp())
      .get("/librarian-only")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toContain("role");
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message", "requestId"]);
  });

  it("LIBRARIAN on a LIBRARIAN-only route → 200", async () => {
    const token = await loginLibrarian();
    const res = await request(buildGuardApp())
      .get("/librarian-only")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("LIBRARIAN");
  });

  it("unauthenticated on a role-gated route gets 401, never 403", async () => {
    const res = await request(buildGuardApp()).get("/librarian-only");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
