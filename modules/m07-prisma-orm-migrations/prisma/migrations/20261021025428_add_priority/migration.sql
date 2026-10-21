-- ============================================================================
-- add_priority — HAND-EDITED migration (created with `prisma migrate dev
-- --create-only`, then rewritten by hand before being applied).
--
-- WHY migrate dev could not generate this for us, in one sentence: it can
-- diff the SCHEMA, but it cannot know what VALUE each existing row's new
-- required column should hold.
--
-- What actually happened when this migration was scaffolded on a table with
-- 4 rows: `migrate dev --create-only` produced the RedefineTables skeleton
-- below (SQLite cannot ALTER a column into NOT NULL, so Prisma's shape is
-- always create-new-table → copy → drop → rename) — but its
--   INSERT INTO "new_tasks" (...) SELECT "created_at", ... FROM "tasks"
-- copied every column EXCEPT priority, so the moment it ran against real
-- rows it could only fail the new NOT NULL. The CLI said so outright:
--   "Step 0 Added the required column `priority` ... There are 4 rows in
--    this table, it is not possible to execute this step."
--
-- The hand-edit is therefore ONE thing the schema diff could never contain:
-- the CASE expression below, deriving each existing row's priority from its
-- due_date. Everything else keeps Prisma's generated skeleton verbatim
-- (including the PRAGMA pairing) so the diff vs the generated file is
-- exactly the teaching content.
--
-- Backfill rule (authored 2026-10-21, so the cutoff is a fixed literal —
-- migrations are authored-time artifacts, and a fixed timestamp keeps the
-- SQL deterministic on every replay):
--   due_date IS NULL              -> 'low'   (nothing to be late for)
--   due_date <  2026-10-21        -> 'high'  (already overdue on authoring day)
--   anything else                 -> 'medium'
-- On a FRESH database this migration runs over zero rows — the backfill is a
-- no-op and priorities come from the seed script instead. That is the normal
-- path for every trainee who clones the repo and runs `npm run db:reset`.
--
-- SAFETY NOTE (the M06 silent-FK lesson, applied): the DROP TABLE below
-- performs an implicit DELETE FROM tasks when foreign keys are enabled, which
-- would CASCADE away task_tags rows without a word. This migration sits in
-- the history BEFORE any junction rows could exist (verified: 0 rows in
-- task_tags at apply time, and 0 on every fresh replay) — the assumption is
-- stated here rather than hidden, because SQL cannot assert it.
-- ============================================================================

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL,
    "due_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- THE HAND-EDIT: one more output column, one CASE expression. Data-derived,
-- so no schema-aware tool could have written it.
INSERT INTO "new_tasks" ("created_at", "description", "due_date", "id", "status", "title", "updated_at", "user_id", "priority")
SELECT
    "created_at", "description", "due_date", "id", "status", "title", "updated_at", "user_id",
    CASE
        WHEN "due_date" IS NULL                      THEN 'low'
        WHEN "due_date" < '2026-10-21T00:00:00.000+00:00' THEN 'high'
        ELSE 'medium'
    END
FROM "tasks";
DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");
CREATE UNIQUE INDEX "tasks_user_id_title_key" ON "tasks"("user_id", "title");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
