// db-smoke.ts — the pre-service-layer proof that the Prisma client round-trips
// what the M06 schema used to hold as text. Four checks, each printing a line:
//
//   1. dueDate round-trip: a DateTime written through Prisma reads back as the
//      same instant (SQLite stores it as ISO-8601 text; we prove it, not assume).
//   2. status/default round-trip: omitted status comes back as 'todo'.
//   3. @updatedAt: an update bumps updated_at without us touching the column.
//   4. ON DELETE CASCADE: deleting the user removes their tasks (M06's
//      fk_tasks_user rule, now expressed in the Prisma schema).
//
// Run: npm run db:smoke   (idempotent — creates, checks, deletes its own rows)

import { prisma } from "../src/db.ts";

async function main(): Promise<void> {
  const email = "smoke@example.test";
  await prisma.user.deleteMany({ where: { email } }); // idempotent re-runs

  const due = new Date("2026-12-31T18:00:00.000Z");

  const user = await prisma.user.create({
    data: { name: "Smoke", email, passwordHash: "not-a-real-hash" },
  });
  const created = await prisma.task.create({
    data: { userId: user.id, title: "smoke: dueDate round-trip", priority: "medium", dueDate: due },
  });

  // 1. dueDate comes back as the same instant.
  const reread = await prisma.task.findUniqueOrThrow({ where: { id: created.id } });
  const dueOk = reread.dueDate instanceof Date && reread.dueDate.getTime() === due.getTime();
  console.log(`1. dueDate round-trip: ${dueOk ? "PASS" : "FAIL"} — stored as ${JSON.stringify(reread.dueDate?.toISOString())}`);

  // 2. Defaulted status came through as 'todo'.
  const statusOk = reread.status === "todo";
  console.log(`2. status default:     ${statusOk ? "PASS" : "FAIL"} — got ${JSON.stringify(reread.status)}`);

  // 3. @updatedAt bumps on update. The pause guarantees a later
  //    client-side timestamp (ms precision) than the create, so the
  //    comparison cannot flake on a same-millisecond write.
  await new Promise((r) => setTimeout(r, 1100));
  const updated = await prisma.task.update({
    where: { id: created.id },
    data: { description: "touched" },
  });
  const bumpOk = updated.updatedAt.getTime() > created.updatedAt.getTime();
  console.log(`3. @updatedAt bump:    ${bumpOk ? "PASS" : "FAIL"}`);

  // 4. Deleting the user cascades to their tasks.
  await prisma.user.delete({ where: { id: user.id } });
  const orphan = await prisma.task.findUnique({ where: { id: created.id } });
  const cascadeOk = orphan === null;
  console.log(`4. user CASCADE:       ${cascadeOk ? "PASS" : "FAIL"}`);

  const allOk = dueOk && statusOk && bumpOk && cascadeOk;
  console.log(allOk ? "SMOKE PASS (4/4)" : "SMOKE FAIL");
  process.exitCode = allOk ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
