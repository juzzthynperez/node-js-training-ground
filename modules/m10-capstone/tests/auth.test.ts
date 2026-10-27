// feat(auth) verification (plan: security checks live, not assumed) —
// registration/login happy + sad paths against the real app and real DB:
// hashing actually happened, duplicate email 409, invalid input 400 at the
// schema, and the anti-enumeration property (unknown email and wrong password
// are indistinguishable answers).

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { prisma } from "../src/db.ts";
import { resetDatabase } from "./helpers/db.ts";

function makeTestApp() {
  return buildApp(loadConfig());
}

const REGISTER = { name: "Ada Reader", email: "ada@library.test", password: "correct-horse-1" };

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/v1/auth/register", () => {
  it("creates the account, hashes the password, and returns a token (201)", async () => {
    const res = await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER);
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: "Ada Reader",
      email: "ada@library.test",
      role: "MEMBER",
    });
    expect(typeof res.body.token).toBe("string");

    // The security claim, asserted at the row: bcrypt hash present, the
    // plaintext nowhere in it.
    const row = await prisma.user.findUnique({ where: { email: "ada@library.test" } });
    expect(row).not.toBeNull();
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.passwordHash).not.toContain(REGISTER.password);
  });

  it("normalizes email casing so Ada@ and ada@ are one account", async () => {
    await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER).expect(201);
    const res = await request(makeTestApp())
      .post("/api/v1/auth/register")
      .send({ ...REGISTER, email: "ADA@library.test" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("refuses a duplicate email with the envelope 409", async () => {
    await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER).expect(201);
    const res = await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toBeUndefined();
  });

  it("never lets the wire set a role — the role key is stripped, MEMBER wins", async () => {
    const res = await request(makeTestApp())
      .post("/api/v1/auth/register")
      .send({ ...REGISTER, role: "LIBRARIAN" });
    // registerSchema is a non-strict object: unknown keys are STRIPPED (M08
    // create-parity), so the request succeeds — and the service pins MEMBER
    // regardless, because the parsed body has no role field to pass along.
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("MEMBER");
    const row = await prisma.user.findUnique({ where: { email: "ada@library.test" } });
    expect(row?.role).toBe("MEMBER");
  });

  it("rejects invalid registration bodies with 400 + details", async () => {
    const cases = [
      { ...REGISTER, password: "short" }, // below the 8-char floor
      { ...REGISTER, email: "not-an-email" },
      { ...REGISTER, name: "   " },
    ];
    for (const body of cases) {
      const res = await request(makeTestApp()).post("/api/v1/auth/register").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });
});

describe("POST /api/v1/auth/login", () => {
  it("returns a verifiable token for correct credentials (200)", async () => {
    await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER).expect(201);

    const res = await request(makeTestApp())
      .post("/api/v1/auth/login")
      .send({ email: "ada@library.test", password: REGISTER.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe("ada@library.test");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("answers wrong password with 401 UNAUTHORIZED", async () => {
    await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER).expect(201);
    const res = await request(makeTestApp())
      .post("/api/v1/auth/login")
      .send({ email: "ada@library.test", password: "wrong-password-99" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("is indistinguishable for unknown email vs wrong password (no enumeration)", async () => {
    await request(makeTestApp()).post("/api/v1/auth/register").send(REGISTER).expect(201);

    const wrongPassword = await request(makeTestApp())
      .post("/api/v1/auth/login")
      .send({ email: "ada@library.test", password: "wrong-password-99" });
    const unknownEmail = await request(makeTestApp())
      .post("/api/v1/auth/login")
      .send({ email: "nobody@library.test", password: "whatever-1234" });

    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it("rejects malformed login bodies at the schema (400 before the service)", async () => {
    const res = await request(makeTestApp())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
