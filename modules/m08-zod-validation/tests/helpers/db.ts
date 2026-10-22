// Test-database helpers (M09) — the isolation machinery the real-DB strategy
// requires. Nothing here mocks anything: every function runs actual Prisma
// queries against test.db.

import { prisma } from "../../src/db.ts";
import { DEFAULT_OWNER_ID } from "../../src/services/task-service.ts";

/**
 * Empty every table in FOREIGN-KEY-SAFE order and re-provision the pinned API
 * owner. Order matters and mirrors prisma/seed.ts's parent/child discipline:
 *   task_tags (references tasks AND tags) → tasks → tags → users.
 * Deleting a tag while a junction row still references it would be refused by
 * fk_task_tags_tag (Restrict); deleting users before tasks would be refused by
 * fk_tasks_user (Cascade would mask it, but explicit child-first is the habit).
 *
 * The default owner is re-created after every reset because the service pins
 * every API-created task to DEFAULT_OWNER_ID (tasks.user_id is NOT NULL) —
 * without the row, every POST would honestly answer 400/P2003.
 *
 * Called from beforeEach: each test starts from an identical, empty database,
 * which is exactly what makes the suite order-independent (--randomize-safe).
 */
export async function resetDatabase(): Promise<void> {
  await prisma.taskTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      id: DEFAULT_OWNER_ID,
      name: "Test Owner",
      email: "owner@test.local",
      passwordHash: "scrypt$test$owner",
    },
  });
}

/** Direct row count — lets a test assert isolation/persistence without
 *  going through the API it is currently exercising. */
export async function countTasks(): Promise<number> {
  return prisma.task.count();
}
