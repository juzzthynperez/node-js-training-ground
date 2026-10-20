-- ============================================================================
-- M06 — 21 graded query exercises against schema.sql + seed.sql.
--
-- HOW TO RUN (fresh):   (cat schema.sql seed.sql) | sqlite3 task.db
--         replay this:  sqlite3 task.db < exercises.sql
--
-- RUN IN ORDER 1 -> 21. Expected answers below assume the seed state.
--   * Q1-Q15 are read-only.
--   * Q16 updates task 5; Q17 deletes task 18 (its 2 junction rows go with it);
--     Q19 creates an index; Q21 commits one new row (id 19).
--   * Q20's ROLLBACK leaves no trace. After Q21 the db has 18 tasks / 28
--     junction rows with ids 1-17 + 19 — re-run schema.sql + seed.sql to get
--     back to the pristine seed (18 tasks, 30 junction rows, ids 1-18).
--
-- Every exercise is graded: the comment states what the result MUST look like
-- (row count, ids, first row, or an error) so you can check yourself before
-- reading any provided answer.
-- ============================================================================

-- Per-connection setting, asserted here like schema.sql and seed.sql do.
-- Without this line Q17's cascade silently does NOTHING (a detached run of
-- this file once returned 30 surviving junction rows instead of 28 — the FKs
-- were simply off, no error, no warning). That silence is the whole hazard.
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Q1 [filtering] All 'todo' tasks due on or before 2026-10-25.
SELECT id, title, due_date
FROM tasks
WHERE status = 'todo'
  AND due_date <= '2026-10-25';
-- GRADED: 3 rows — ids 6, 10, 13. Notice tasks 1/4/7/11/16 VANISHED even
-- though they are 'todo': due_date is NULL, and NULL <= '2026-10-25' is not
-- true, it is unknown. Three-valued logic bites here; Q3 retrieves them.

-- Q2 [filtering] Todo/in-progress tasks whose title mentions Buy or Write —
-- prove AND binds tighter than OR by using explicit parentheses.
SELECT id, title, status
FROM tasks
WHERE status IN ('todo', 'in_progress')
  AND (title LIKE '%Buy%' OR title LIKE '%Write%');
-- GRADED: 5 rows — ids 1, 2, 7, 10, 16. Without the parentheses the OR would
-- swallow every 'todo' row regardless of title.

-- Q3 [filtering] Every task with no due date.
SELECT id, title, due_date
FROM tasks
WHERE due_date IS NULL;
-- GRADED: 6 rows — ids 1, 4, 7, 11, 15, 16. '=' never matches NULL; only
-- IS NULL / IS NOT NULL do.

-- ----------------------------------------------------------------------------
-- Q4 [sorting] Sort by status, then due date, then id (id breaks ties so the
-- order is fully deterministic).
SELECT id, status, due_date
FROM tasks
ORDER BY status, due_date, id;
-- GRADED: 18 rows. SQLite sorts NULL before text in ASC order. First five are
-- the 'done' group (18, 9, 12, 3, 14), then 'in_progress' (15, 8, 5, 2),
-- then 'todo' (1, 4, 7, 11, 16, 13, 10, 6, 17).

-- Q5 [pagination] Page 2 of the task list, 5 rows per page, ordered by id.
SELECT id, title
FROM tasks
ORDER BY id
LIMIT 5 OFFSET 5;
-- GRADED: ids 6, 7, 8, 9, 10.

-- Q6 [pagination] Keyset pagination: everything after id 10, no OFFSET.
SELECT id, title
FROM tasks
WHERE id > 10
ORDER BY id
LIMIT 5;
-- GRADED: ids 11, 12, 13, 14, 15. Same rows Q5-style paging would hand you at
-- this depth, but the engine SEEKS straight to id 11 instead of counting and
-- discarding 10 rows. At OFFSET 1000000 that difference is the whole design.

-- ----------------------------------------------------------------------------
-- Q7 [join, INNER] Each task with its owner's name — users with no tasks are
-- silently excluded by INNER JOIN.
SELECT u.name, t.title
FROM users u
INNER JOIN tasks t ON t.user_id = u.id
ORDER BY u.id, t.id;
-- GRADED: 18 rows (every task appears exactly once). Dave is absent.

-- Q8 [join, INNER] Three-way join: task -> junction -> tag. Every junction
-- row becomes one (task, tag) pair.
SELECT t.title, tg.name AS tag
FROM tasks t
INNER JOIN task_tags tt ON tt.task_id = t.id
INNER JOIN tags tg      ON tg.id = tt.tag_id
ORDER BY t.id, tg.id;
-- GRADED: 30 rows — the junction table's exact row count, one row each.

-- Q9 [join, LEFT] Every task with any tags; untagged tasks keep their row with
-- NULL in the tag columns.
SELECT t.id, t.title, tg.name AS tag
FROM tasks t
LEFT JOIN task_tags tt ON tt.task_id = t.id
LEFT JOIN tags tg      ON tg.id = tt.tag_id
ORDER BY t.id;
-- GRADED: 32 rows = 30 tagged + 2 untagged (ids 11 and 16, tag shows NULL).
-- INNER JOIN Q8 had no row for those two tasks at all.

-- Q10 [join, LEFT] Contrast pair with Q7: ALL users, plus their task title
-- (NULL where they have none).
SELECT u.name, t.title
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id
ORDER BY u.id, t.id;
-- GRADED: 19 rows = 18 tasks + 1 extra row for Dave (name kept, title NULL).

-- ----------------------------------------------------------------------------
-- Q11 [aggregates, GROUP BY] Task count per user — including users with zero
-- tasks, which only the LEFT JOIN makes visible.
SELECT u.name, COUNT(t.id) AS task_count
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id
GROUP BY u.id, u.name
ORDER BY u.name;
-- GRADED: 4 rows — Alice 6, Bob 6, Carol 6, Dave 0. COUNT(t.id) counts the
-- joined side, so Dave's 0 is a real 0, not a phantom 1 (COUNT(*) would have
-- counted his empty row — know which one you want).

-- Q12 [aggregates, GROUP BY] How often each tag is used, most-used first.
SELECT tg.name, COUNT(*) AS uses
FROM tags tg
INNER JOIN task_tags tt ON tt.tag_id = tg.id
GROUP BY tg.id, tg.name
ORDER BY uses DESC, tg.name;
-- GRADED: 6 rows ('someday' absent — INNER JOIN drops it before grouping) —
-- work 11, urgent 5, admin 4, home 4, learning 4, errand 2. 11+5+4+4+4+2 = 30.

-- Q13 [aggregates, HAVING] Same counting idea as Q12, but keep only tags used
-- more than twice — HAVING filters the GROUPS after they exist, WHERE cannot.
SELECT tg.name, COUNT(tt.task_id) AS uses
FROM tags tg
LEFT JOIN task_tags tt ON tt.tag_id = tg.id
GROUP BY tg.id, tg.name
HAVING COUNT(tt.task_id) > 2
ORDER BY uses DESC, tg.name;
-- GRADED: 5 rows — work 11, urgent 5, admin 4, home 4, learning 4.
-- errand (2) and someday (0) are removed by HAVING, not by the join.

-- ----------------------------------------------------------------------------
-- Q14 [subquery] Tasks carrying the 'urgent' tag — one statement, no JOIN.
SELECT id, title
FROM tasks
WHERE id IN (
    SELECT task_id
    FROM task_tags
    WHERE tag_id = (SELECT id FROM tags WHERE name = 'urgent')
);
-- GRADED: 5 rows — ids 2, 6, 8, 17, 18. (Nested scalar subquery inside an IN
-- subquery: both must resolve before the outer query runs.)

-- Q15 [subquery, correlated EXISTS] Users who have no tasks at all.
SELECT u.id, u.name
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.user_id = u.id
);
-- GRADED: 1 row — id 4, Dave. The inner query is CORRELATED: it re-runs once
-- per outer row, asking "does this user have any task?" — the defining shape
-- of EXISTS/NOT EXISTS.

-- ----------------------------------------------------------------------------
-- Q16 [DML] Mark task 5 done and bump its updated_at, then verify.
UPDATE tasks
SET status = 'done', updated_at = CURRENT_TIMESTAMP
WHERE id = 5;

SELECT id, status, updated_at
FROM tasks
WHERE id = 5;
-- GRADED: 1 row, status 'done'. (The CHECK constraint accepts only todo,
-- in_progress, done — try status = 'finished' in an interactive session and
-- read the error: CHECK constraint failed: ck_tasks_status.)

-- Q17 [DML] Delete task 18 — its junction rows must go with it (ON DELETE
-- CASCADE), while the rest of task_tags survives untouched.
DELETE FROM tasks WHERE id = 18;

SELECT (SELECT COUNT(*) FROM tasks)     AS tasks_left,
       (SELECT COUNT(*) FROM task_tags) AS junction_left;
-- GRADED: tasks_left 17, junction_left 28 — task 18 held exactly 2 junction
-- rows (admin, urgent) and both cascaded away.

-- ----------------------------------------------------------------------------
-- Q18 [indexes] Inspect the plan for a status filter BEFORE an index exists.
EXPLAIN QUERY PLAN
SELECT id, title FROM tasks WHERE status = 'todo';
-- GRADED: a SCAN line over tasks (no index on status — schema.sql deliberately
-- left it unbuilt). Read these two lines: the word SCAN means every row is
-- read; SEARCH ... USING INDEX means the b-tree is walked instead.

-- Q19 [indexes] Build the index Q18 was missing, then re-inspect.
CREATE INDEX idx_tasks_status ON tasks (status);

EXPLAIN QUERY PLAN
SELECT id, title FROM tasks WHERE status = 'todo';
-- GRADED: now a SEARCH line — tasks USING INDEX idx_tasks_status.
-- Trade-off to remember: every INSERT/UPDATE/DELETE now also maintains this
-- index. That is what an index IS: pre-sorted structure paid for on write,
-- saved on read.

-- ----------------------------------------------------------------------------
-- Q20 [transaction, ROLLBACK] Undo a bulk update in flight.
BEGIN;
UPDATE tasks SET status = 'todo' WHERE status = 'done';
SELECT COUNT(*) AS done_inside_txn FROM tasks WHERE status = 'done';
ROLLBACK;
SELECT COUNT(*) AS done_after_rollback FROM tasks WHERE status = 'done';
-- GRADED: two result rows in one statement set — done_inside_txn 0, then
-- done_after_rollback 5 (ids 3, 5, 9, 12, 14 — Q16 flipped 5 to done, Q17
-- deleted 18). The
-- uncommitted state was visible inside the transaction and vanished with
-- ROLLBACK. No constraint or error was involved: ROLLBACK is not failure,
-- it is "changed my mind".

-- Q21 [transaction, COMMIT] Dave's first task, made durable. Atomicity means
-- the INSERT and the UPDATE below succeed or fail together.
BEGIN;
INSERT INTO tasks (id, user_id, title, description, status, created_at, updated_at)
VALUES (19, 4, 'Set up work laptop', 'Dave finally has a task', 'todo',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
UPDATE users SET name = 'Dave Kim' WHERE id = 4;  -- same transaction, no-op value
COMMIT;

SELECT id, user_id, title FROM tasks WHERE id = 19;
-- GRADED: 1 row, id 19, user_id 4. Note on ids: omitting id would have made
-- SQLite pick 18 (max existing rowid + 1) — it reuses ids once the top one is
-- deleted — so 19 is written explicitly to keep ids stable. Rebuilding with
-- schema.sql + seed.sql resets everything (18 tasks, 30 junction rows).
