// seed.ts — the M06 seed data (modules/m06-sql-fundamentals-sqlite/seed.sql)
// ported to Prisma, at parity: 4 users / 18 tasks / 7 tags / 30 junction rows.
//
// Runs two ways, same result both times:
//   * explicitly by `npm run db:seed`, or as part of `npm run db:reset`
//     (which chains `prisma migrate reset` + this script — in Prisma 7.10.1
//     `migrate reset` alone does NOT seed, only `prisma db seed` reads
//     migrations.seed from prisma7.config.ts);
//   * re-running standalone is safe: it clears child tables first and rebuilds.
//
// DETERMINISM IS THE POINT (M06's lesson, kept):
//   * every id is a FIXED UUID, not randomUUID() — evidence transcripts,
//     Bruno runs, and the write-up all reference the same rows after every
//     reset;
//   * user 1's id IS the service layer's DEFAULT_OWNER_ID, so API-created
//     tasks and seeded tasks share one owner and the per-owner unique title
//     rule stays aligned with the API's global 409;
//   * created_at/updated_at are explicit, as in the SQL seed, so ORDER BY
//     answers are stable across reruns.
//
// PRIORITY uses the same rule the add_priority migration backfilled with
// (overdue -> high, due later -> medium, no due date -> low), so seeded data
// and migrated-era data are indistinguishable — the cutoff is the seed's own
// "today" (2026-10-21), same literal as the migration.
//
// Insert order is the M06 lesson again: parents before children —
//   users -> tasks -> tags -> task_tags (needs BOTH to exist).

import { prisma } from "../src/db.ts";
import { DEFAULT_OWNER_ID } from "../src/services/task-service.ts";

// Fixed UUIDs in the v4 shape (isValidId-compatible). Ranges:
//   users  ...0001-0004 | tasks ...0011-0028 (10+n, decimal-padded) | tags ...0101-0107
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tid = (n: number): string => `00000000-0000-4000-8000-${String(10 + n).padStart(12, "0")}`;
const tagId = (n: number): string => `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`;

const CUTOFF = new Date("2026-10-21T00:00:00.000Z"); // the migration's authored date

function priorityFor(due: Date | null): "low" | "medium" | "high" {
  if (!due) return "low";
  return due < CUTOFF ? "high" : "medium";
}

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const USERS = [
  { id: uid(1), name: "Alice Nguyen", email: "alice@example.com", passwordHash: "scrypt$alice$fakehash001", createdAt: new Date("2026-10-07T08:00:00.000Z") },
  { id: uid(2), name: "Bob Okafor", email: "bob@example.com", passwordHash: "scrypt$bob$fakehash002", createdAt: new Date("2026-10-07T08:05:00.000Z") },
  { id: uid(3), name: "Carol Reyes", email: "carol@example.com", passwordHash: "scrypt$carol$fakehash003", createdAt: new Date("2026-10-07T08:10:00.000Z") },
  { id: uid(4), name: "Dave Kim", email: "dave@example.com", passwordHash: "scrypt$dave$fakehash004", createdAt: new Date("2026-10-07T08:15:00.000Z") },
];

// [n, owner, title, description, status, dueDate, createdAt, updatedAt] — 18 rows,
// exactly the M06 set. dave (user 4) keeps ZERO tasks on purpose.
const TASKS: [number, number, string, string, string, string | null, string, string][] = [
  [1, 1, "Buy milk", "Semi-skimmed, 2 pints", "todo", null, "2026-10-08T09:00:00.000Z", "2026-10-08T09:00:00.000Z"],
  [2, 1, "Write sprint report", "Week 3 summary for the team", "in_progress", "2026-10-22", "2026-10-08T09:30:00.000Z", "2026-10-12T17:00:00.000Z"],
  [3, 1, "Review pull requests", "PRs #10 and #11", "done", "2026-10-18", "2026-10-09T10:00:00.000Z", "2026-10-18T15:45:00.000Z"],
  [4, 1, "Book dentist appointment", "Routine check-up", "todo", null, "2026-10-09T11:00:00.000Z", "2026-10-09T11:00:00.000Z"],
  [5, 1, "Prepare M06 schema notes", "Junction table decisions", "in_progress", "2026-10-21", "2026-10-10T08:45:00.000Z", "2026-10-14T12:00:00.000Z"],
  [6, 1, "Pay electricity bill", "Due end of month", "todo", "2026-10-25", "2026-10-10T18:20:00.000Z", "2026-10-10T18:20:00.000Z"],
  [7, 2, "Buy oat milk", "Bob’s own errand; title is unique", "todo", null, "2026-10-11T08:10:00.000Z", "2026-10-11T08:10:00.000Z"],
  [8, 2, "Fix login bug", "Symptom: 500 on bad password", "in_progress", "2026-10-20", "2026-10-11T09:00:00.000Z", "2026-10-15T14:00:00.000Z"],
  [9, 2, "Update dependencies", "express 5.3.0, zod 4", "done", "2026-10-15", "2026-10-11T10:30:00.000Z", "2026-10-15T16:20:00.000Z"],
  [10, 2, "Write unit tests", "Cover the happy path first", "todo", "2026-10-24", "2026-10-12T08:00:00.000Z", "2026-10-12T08:00:00.000Z"],
  [11, 2, "Refactor config module", "No due date, no tags", "todo", null, "2026-10-12T13:40:00.000Z", "2026-10-12T13:40:00.000Z"],
  [12, 2, "Deploy staging build", "v1.4.0 candidate", "done", "2026-10-17", "2026-10-13T09:15:00.000Z", "2026-10-17T11:00:00.000Z"],
  [13, 3, "Plan sprint retro", "Agenda + open questions", "todo", "2026-10-23", "2026-10-13T10:00:00.000Z", "2026-10-13T10:00:00.000Z"],
  [14, 3, "Design ERD draft", "Mermaid diagram for README", "done", "2026-10-19", "2026-10-13T11:20:00.000Z", "2026-10-19T09:30:00.000Z"],
  [15, 3, "Research index strategies", "B-tree vs covering indexes", "in_progress", null, "2026-10-14T08:30:00.000Z", "2026-10-16T10:10:00.000Z"],
  [16, 3, "Buy coffee beans", "No due date, no tags", "todo", null, "2026-10-14T14:00:00.000Z", "2026-10-14T14:00:00.000Z"],
  [17, 3, "Migrate legacy data", "CSV export -> this schema", "todo", "2026-10-30", "2026-10-15T09:45:00.000Z", "2026-10-15T09:45:00.000Z"],
  [18, 3, "Close Q3 budget", "Finance sign-off needed", "done", "2026-10-10", "2026-10-15T16:00:00.000Z", "2026-10-10T17:30:00.000Z"],
];

const TAGS: [number, string][] = [
  [1, "work"], [2, "home"], [3, "urgent"], [4, "errand"],
  [5, "learning"], [6, "admin"], [7, "someday"], // "someday" is never used on purpose
];

// 30 junction rows; tasks 11 and 16 untagged on purpose (LEFT JOIN material).
const JUNCTION: [number, number][] = [
  [1, 2], [1, 4],
  [2, 1], [2, 3],
  [3, 1],
  [4, 2], [4, 4],
  [5, 1], [5, 5],
  [6, 2], [6, 3],
  [7, 2],
  [8, 1], [8, 3],
  [9, 1], [9, 6],
  [10, 1], [10, 5],
  [12, 1], [12, 6],
  [13, 1], [13, 6],
  [14, 1], [14, 5],
  [15, 1], [15, 5],
  [17, 1], [17, 3],
  [18, 6], [18, 3],
];

async function main(): Promise<void> {
  // Clear children first so standalone re-runs are idempotent.
  await prisma.taskTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: USERS });
  await prisma.task.createMany({
    data: TASKS.map(([n, owner, title, description, status, due, created, updated]) => ({
      id: tid(n),
      userId: uid(owner),
      title,
      description,
      status,
      dueDate: due ? day(due) : null,
      priority: priorityFor(due ? day(due) : null),
      createdAt: new Date(created),
      updatedAt: new Date(updated),
    })),
  });
  await prisma.tag.createMany({ data: TAGS.map(([n, name]) => ({ id: tagId(n), name })) });
  await prisma.taskTag.createMany({
    data: JUNCTION.map(([t, g]) => ({ taskId: tid(t), tagId: tagId(g) })),
  });

  // GRADED: expected counts, checked on every run (M06's executable spec).
  const [users, tasks, tags, pairs, untagged, unusedTag] = await Promise.all([
    prisma.user.count(),
    prisma.task.count(),
    prisma.tag.count(),
    prisma.taskTag.count(),
    prisma.task.count({ where: { taskTags: { none: {} } } }),
    prisma.tag.count({ where: { taskTags: { none: {} } } }),
  ]);

  const expected = { users: 4, tasks: 18, tags: 7, pairs: 30, untagged: 2, unusedTag: 1 };
  const actual = { users, tasks, tags, pairs, untagged, unusedTag };
  console.log("seed counts:", actual);

  const ok =
    users === expected.users && tasks === expected.tasks && tags === expected.tags &&
    pairs === expected.pairs && untagged === expected.untagged && unusedTag === expected.unusedTag;

  if (!ok) {
    console.error("SEED FAIL — expected:", expected);
    process.exitCode = 1;
    return;
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: DEFAULT_OWNER_ID } });
  console.log(`SEED PASS — default owner: ${owner.name} <${owner.email}>`);
}

main().finally(() => prisma.$disconnect());
