// Test-data factories (M09 step 5) — reusable row builders that write REAL
// rows through the real Prisma client. Determinism rules (carried from
// prisma/seed.ts): explicit ids/timestamps where a test's assertion depends on
// them, so sort/pagination expectations hold in any execution order.

import { prisma } from "../../src/db.ts";
import { DEFAULT_OWNER_ID } from "../../src/services/task-service.ts";

export interface TaskSeed {
  id?: string;
  title: string;
  description?: string;
  status?: "todo" | "in_progress" | "done";
  priority?: "low" | "medium" | "high";
  dueDate?: Date | null;
  createdAt?: Date;
}

/** Fixed-id task factory: pass an id when a test needs to remember a row's
 *  identity across arrange/act/assert; omit it for a normal generated UUID. */
export async function createTaskRow(seed: TaskSeed) {
  return prisma.task.create({
    data: {
      ...(seed.id !== undefined ? { id: seed.id } : {}),
      userId: DEFAULT_OWNER_ID,
      title: seed.title,
      description: seed.description ?? "",
      status: seed.status ?? "todo",
      priority: seed.priority ?? "medium",
      dueDate: seed.dueDate ?? null,
      ...(seed.createdAt !== undefined ? { createdAt: seed.createdAt } : {}),
    },
  });
}

/** Deterministic sequence of timestamps for sort/page tests: index N always
 *  yields the same instant, so `sort=createdAt&order=asc` has an expectation
 *  that cannot drift between runs. */
export function sequencedDate(index: number): Date {
  return new Date(Date.UTC(2026, 0, 1 + index, 12, 0, 0));
}

/** Seed N tasks created minutes apart, titles task-000 … task-N. */
export async function seedTasks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createTaskRow({
      title: `task-${String(i).padStart(3, "0")}`,
      status: i % 3 === 1 ? "in_progress" : i % 3 === 2 ? "done" : "todo",
      createdAt: sequencedDate(i),
    });
  }
}
