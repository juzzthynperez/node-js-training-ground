// error-proofs.ts — the three Prisma error codes, each forced directly through
// the client and pushed through the SAME mapPrismaError the service uses.
//
// Why a script and not Bruno: the tasks-only API can never produce P2003
// (every create pins DEFAULT_OWNER_ID, a constant the seed guarantees), so
// the foreign-key mapping is proven here — at the seam — instead of being
// claimed. P2002 and P2025 are ALSO proven end-to-end through the API
// (bruno v2/07 and tasks/08+12); this script shows all three at the mapper.
//
// Run: npm run prove:errors   (idempotent — every write FAILS by design, so
// nothing is left behind and the seed data stays untouched)

import { Prisma } from "../src/generated/prisma/client.ts";
import { prisma } from "../src/db.ts";
import { mapPrismaError } from "../src/services/task-service.ts";
import { AppError } from "../src/errors.ts";

function verdict(label: string, code: string, status: number, ok: boolean): boolean {
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${code} (HTTP ${status})`);
  return ok;
}

async function forceError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return new Error("expected the call to throw, it did not");
  } catch (err) {
    return mapPrismaError(err, { title: "Buy milk", id: "00000000-0000-4000-8000-00000000ffff" });
  }
}

async function main(): Promise<void> {
  let allOk = true;

  // P2002 — duplicate (user_id, title): alice already owns "Buy milk".
  const p2002 = await forceError(() =>
    prisma.task.create({
      data: {
        userId: "00000000-0000-4000-8000-000000000001",
        title: "Buy milk",
        priority: "medium",
      },
    }),
  );
  allOk = verdict(
    "P2002 unique violation",
    p2002 instanceof AppError && p2002.code === "CONFLICT" ? "P2002->CONFLICT" : `UNEXPECTED(${String(p2002)})`,
    p2002 instanceof AppError ? p2002.status : 0,
    p2002 instanceof AppError && p2002.code === "CONFLICT" && p2002.status === 409,
  ) && allOk;

  // P2025 — update a task id that does not exist.
  const p2025 = await forceError(() =>
    prisma.task.update({
      where: { id: "00000000-0000-4000-8000-00000000ffff" },
      data: { title: "ghost" },
    }),
  );
  allOk = verdict(
    "P2025 record not found",
    p2025 instanceof AppError && p2025.code === "NOT_FOUND" ? "P2025->NOT_FOUND" : `UNEXPECTED(${String(p2025)})`,
    p2025 instanceof AppError ? p2025.status : 0,
    p2025 instanceof AppError && p2025.code === "NOT_FOUND" && p2025.status === 404,
  ) && allOk;

  // P2003 — foreign key violation: a user id that was never seeded.
  const p2003 = await forceError(() =>
    prisma.task.create({
      data: {
        userId: "00000000-0000-4000-8000-00000000eeee",
        title: "orphan task",
        priority: "medium",
      },
    }),
  );
  allOk = verdict(
    "P2003 foreign key violation",
    p2003 instanceof AppError && p2003.code === "VALIDATION_ERROR" ? "P2003->VALIDATION_ERROR" : `UNEXPECTED(${String(p2003)})`,
    p2003 instanceof AppError ? p2003.status : 0,
    p2003 instanceof AppError && p2003.code === "VALIDATION_ERROR" && p2003.status === 400,
  ) && allOk;

  // The raw codes, shown next to their translations.
  console.log("\nraw codes seen:", [
    p2002 instanceof Error && p2002.message.includes("Buy milk") ? "P2002 (message preserved)" : "?",
    p2025 instanceof Error && p2025.message.includes("00000000ffff") ? "P2025 (id in message)" : "?",
  ].join(" | "));

  console.log(allOk ? "ERROR MAPPING PASS (3/3)" : "ERROR MAPPING FAIL");
  process.exitCode = allOk ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
