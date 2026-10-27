// M09 carry-forward (retro rec #1): the FIRST thing the suite proves is the
// environment it runs in — not one line of behavior is trustworthy if these
// fail. If the forced-env pattern (tests/setup-env.mjs) ever breaks, this
// suite says so instead of passing against a developer's real database with
// real credentials.

import { describe, expect, it } from "@jest/globals";

describe("test environment invariants", () => {
  it("DATABASE_URL points at the disposable test.db, never dev.db", () => {
    expect(process.env["DATABASE_URL"]).toBe("file:./test.db");
  });

  it("NODE_ENV is test (fail-safe: no production-only branches misfire)", () => {
    expect(process.env["NODE_ENV"]).toBe("test");
  });

  it("JWT_SECRET is the forced test-only value, ≥32 chars", () => {
    const secret = process.env["JWT_SECRET"];
    expect(secret).toBe("test-only-secret-not-a-real-credential-0123456789");
    expect(secret?.length).toBeGreaterThanOrEqual(32);
  });

  it("BCRYPT_ROUNDS is forced down to 4 (speed — hashing presence is the property)", () => {
    expect(process.env["BCRYPT_ROUNDS"]).toBe("4");
  });

  it("rate-limit ceiling is forced high so normal suites never trip it", () => {
    expect(process.env["RATE_LIMIT_MAX"]).toBe("1000");
  });
});
