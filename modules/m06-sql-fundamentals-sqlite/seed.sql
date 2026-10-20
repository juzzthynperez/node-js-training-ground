-- ============================================================================
-- M06 — Seed data for the users/tasks/tags/task_tags schema.
--
-- HOW TO RUN: after schema.sql, in the SAME session (or any fresh session —
-- this file re-asserts the PRAGMA itself):
--   sqlite> .read seed.sql
--
-- This file is NOT idempotent on its own: re-running it duplicates rows (and
-- the UNIQUE constraints will stop some of them anyway). The repeatable recipe
-- is: .read schema.sql  then  .read seed.sql — schema.sql drops and recreates.
--
-- Insert order IS the lesson: parents before children —
--   users (no FKs)  ->  tasks (needs users)  ->  tags (no FKs)  ->  task_tags
--   (needs BOTH tasks and tags to exist).
--
-- Data is shaped deliberately so the exercises have real answers:
--   * 4 users, but dave has ZERO tasks        -> LEFT JOIN misses show up
--   * 18 tasks, explicit ids and created_at   -> deterministic ORDER BY / OFFSET
--   * globally unique titles: alice owns "Buy milk", bob owns "Buy oat milk".
--     The DB rule ALLOWS cross-owner duplicates (UNIQUE(user_id, title) is
--     composite) but the seed never exercises that, so nothing here ever
--     contradicts M05's stricter global 409 rule. The cross-owner allowance
--     is proven live in evidence/m06/constraint-proofs.txt (TEST 6) instead
--     of with rows the M05 API would reject.
--   * 2 tasks are untagged (11, 16)           -> untagged rows survive LEFT JOIN
--   * tag "someday" (7) is never used         -> HAVING COUNT = 0 is non-vacuous
--   * 30 junction rows; several tasks carry multiple tags -> M:N is visible
--   * due_date mixes NULL and ISO dates       -> IS NULL / date filters matter
-- ============================================================================

PRAGMA foreign_keys = ON;

INSERT INTO users (id, name, email, password_hash, created_at) VALUES
    (1, 'Alice Nguyen', 'alice@example.com', 'scrypt$alice$fakehash001', '2026-10-07 08:00:00'),
    (2, 'Bob Okafor',   'bob@example.com',   'scrypt$bob$fakehash002',   '2026-10-07 08:05:00'),
    (3, 'Carol Reyes',  'carol@example.com', 'scrypt$carol$fakehash003', '2026-10-07 08:10:00'),
    (4, 'Dave Kim',     'dave@example.com',  'scrypt$dave$fakehash004',  '2026-10-07 08:15:00');

INSERT INTO tasks (id, user_id, title, description, status, due_date, created_at, updated_at) VALUES
    ( 1, 1, 'Buy milk',                'Semi-skimmed, 2 pints',        'todo',        NULL,           '2026-10-08 09:00:00', '2026-10-08 09:00:00'),
    ( 2, 1, 'Write sprint report',     'Week 3 summary for the team',  'in_progress', '2026-10-22',   '2026-10-08 09:30:00', '2026-10-12 17:00:00'),
    ( 3, 1, 'Review pull requests',    'PRs #10 and #11',              'done',        '2026-10-18',   '2026-10-09 10:00:00', '2026-10-18 15:45:00'),
    ( 4, 1, 'Book dentist appointment','Routine check-up',            'todo',        NULL,           '2026-10-09 11:00:00', '2026-10-09 11:00:00'),
    ( 5, 1, 'Prepare M06 schema notes','Junction table decisions',     'in_progress', '2026-10-21',   '2026-10-10 08:45:00', '2026-10-14 12:00:00'),
    ( 6, 1, 'Pay electricity bill',    'Due end of month',             'todo',        '2026-10-25',   '2026-10-10 18:20:00', '2026-10-10 18:20:00'),
    ( 7, 2, 'Buy oat milk',            'Bob’s own errand; title is unique', 'todo',     NULL,           '2026-10-11 08:10:00', '2026-10-11 08:10:00'),
    ( 8, 2, 'Fix login bug',           'Symptom: 500 on bad password', 'in_progress', '2026-10-20',   '2026-10-11 09:00:00', '2026-10-15 14:00:00'),
    ( 9, 2, 'Update dependencies',     'express 5.3.0, zod 4',         'done',        '2026-10-15',   '2026-10-11 10:30:00', '2026-10-15 16:20:00'),
    (10, 2, 'Write unit tests',        'Cover the happy path first',   'todo',        '2026-10-24',   '2026-10-12 08:00:00', '2026-10-12 08:00:00'),
    (11, 2, 'Refactor config module',  'No due date, no tags',         'todo',        NULL,           '2026-10-12 13:40:00', '2026-10-12 13:40:00'),
    (12, 2, 'Deploy staging build',    'v1.4.0 candidate',             'done',        '2026-10-17',   '2026-10-13 09:15:00', '2026-10-17 11:00:00'),
    (13, 3, 'Plan sprint retro',       'Agenda + open questions',      'todo',        '2026-10-23',   '2026-10-13 10:00:00', '2026-10-13 10:00:00'),
    (14, 3, 'Design ERD draft',        'Mermaid diagram for README',   'done',        '2026-10-19',   '2026-10-13 11:20:00', '2026-10-19 09:30:00'),
    (15, 3, 'Research index strategies','B-tree vs covering indexes',  'in_progress', NULL,           '2026-10-14 08:30:00', '2026-10-16 10:10:00'),
    (16, 3, 'Buy coffee beans',        'No due date, no tags',         'todo',        NULL,           '2026-10-14 14:00:00', '2026-10-14 14:00:00'),
    (17, 3, 'Migrate legacy data',     'CSV export -> this schema',    'todo',        '2026-10-30',   '2026-10-15 09:45:00', '2026-10-15 09:45:00'),
    (18, 3, 'Close Q3 budget',         'Finance sign-off needed',      'done',        '2026-10-10',   '2026-10-15 16:00:00', '2026-10-10 17:30:00');

INSERT INTO tags (id, name, created_at) VALUES
    (1, 'work',     '2026-10-07 09:00:00'),
    (2, 'home',     '2026-10-07 09:01:00'),
    (3, 'urgent',   '2026-10-07 09:02:00'),
    (4, 'errand',   '2026-10-07 09:03:00'),
    (5, 'learning', '2026-10-07 09:04:00'),
    (6, 'admin',    '2026-10-07 09:05:00'),
    (7, 'someday',  '2026-10-07 09:06:00');

INSERT INTO task_tags (task_id, tag_id) VALUES
    ( 1, 2), ( 1, 4),   -- Buy milk (alice): home + errand
    ( 2, 1), ( 2, 3),   -- Write sprint report: work + urgent
    ( 3, 1),            -- Review pull requests: work
    ( 4, 2), ( 4, 4),   -- Book dentist: home + errand
    ( 5, 1), ( 5, 5),   -- Prepare M06 schema notes: work + learning
    ( 6, 2), ( 6, 3),   -- Pay electricity bill: home + urgent
    ( 7, 2),            -- Buy oat milk (bob): home
    ( 8, 1), ( 8, 3),   -- Fix login bug: work + urgent
    ( 9, 1), ( 9, 6),   -- Update dependencies: work + admin
    (10, 1), (10, 5),   -- Write unit tests: work + learning
    (12, 1), (12, 6),   -- Deploy staging build: work + admin
    (13, 1), (13, 6),   -- Plan sprint retro: work + admin
    (14, 1), (14, 5),   -- Design ERD draft: work + learning
    (15, 1), (15, 5),   -- Research index strategies: work + learning
    (17, 1), (17, 3),   -- Migrate legacy data: work + urgent
    (18, 6), (18, 3);   -- Close Q3 budget: admin + urgent
-- 30 rows. Untagged tasks: 11 and 16. Unused tag: 7 ('someday'). Every title in
-- the seed is globally unique so the data never contradicts M05's global 409
-- rule; that two different owners MAY share a title under UNIQUE(user_id, title)
-- is proven live in evidence/m06/constraint-proofs.txt (TEST 6).
