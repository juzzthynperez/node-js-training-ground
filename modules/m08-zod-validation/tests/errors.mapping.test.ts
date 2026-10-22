// M09 — the error seam, exercised against the REAL client. mapPrismaError's
// P2003 case and its no-context fallback arms are unreachable through the
// tasks-only API (the service pins a constant owner, so no request can send a
// dangling reference — m07 proved them via direct client calls in
// evidence/m07/error-mapping.txt). This suite keeps that proof honest in the
// 80%-coverage era: it drives GENUINE Prisma errors out of the real test.db
// with direct client calls and asserts the mapping — nothing is mocked, the
// database is the real one, only the ENTRY POINT skips the HTTP layer.

import { describe, expect, it, beforeEach } from "@jest/globals";
import { prisma } from "../src/db.ts";
import { mapPrismaError } from "../src/services/task-service.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../src/errors.ts";
import { resetDatabase } from "./helpers/db.ts";
import { createTaskRow } from "./helpers/factories.ts";

beforeEach(async () => {
  await resetDatabase();
});

/** Run a real client call that MUST fail, return the genuine error it threw. */
async function captureRealError(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (err) {
    return err;
  }
  throw new Error("expected the real client call to fail, but it succeeded");
}

describe("mapPrismaError — real errors, real database", () => {
  it("genuine P2003 (FK violation on a dangling userId) → 400", async () => {
    const real = await captureRealError(() =>
      prisma.task.create({
        data: {
          userId: "00000000-0000-4000-8000-00000000dead", // no such user
          title: "orphan task",
          status: "todo",
          priority: "medium",
        },
      }),
    );

    const mapped = mapPrismaError(real, {}); // no context — the fallback arm
    expect(mapped).toBeInstanceOf(BadRequestError);
    expect((mapped as BadRequestError).status).toBe(400);
    expect((mapped as BadRequestError).message).toBe("Referenced resource does not exist");
  });

  it("genuine P2002 without context → the generic ConflictError arm", async () => {
    await createTaskRow({ title: "duplicate" });
    const owner = await prisma.user.findFirstOrThrow(); // the pinned owner is the only row
    const real = await captureRealError(() =>
      prisma.task.create({
        data: {
          userId: owner.id,
          title: "duplicate", // trips @@unique([userId, title])
          status: "todo",
          priority: "medium",
        },
      }),
    );

    const mapped = mapPrismaError(real, {});
    expect(mapped).toBeInstanceOf(ConflictError);
    expect((mapped as ConflictError).message).toBe("Resource conflict");
  });

  it("genuine P2025 without context → the generic NotFoundError arm", async () => {
    const real = await captureRealError(() =>
      prisma.task.update({
        where: { id: "00000000-0000-4000-8000-000000000999" },
        data: { status: "done" },
      }),
    );

    const mapped = mapPrismaError(real, {});
    expect(mapped).toBeInstanceOf(NotFoundError);
    expect((mapped as NotFoundError).message).toBe("Resource not found");
  });

  it("anything that is not a known Prisma error passes through UNCHANGED", () => {
    const programmerError = new Error("totally unrelated");
    expect(mapPrismaError(programmerError, { title: "x" })).toBe(programmerError);
  });
});
