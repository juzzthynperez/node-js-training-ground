-- ============================================================================
-- M06 — Task API relational schema (SQLite)
-- users / tasks / tags / task_tags  —  1:N (user -> tasks) + M:N (tasks <-> tags)
--
-- HOW TO RUN (fresh database, from this folder):
--   sqlite3 task.db
--   sqlite> .read schema.sql
--   sqlite> .read seed.sql
-- or one shot:  (cat schema.sql seed.sql) | sqlite3 task.db
--
-- PRAGMA foreign_keys is PER-CONNECTION and OFF by default in every new CLI
-- session. schema.sql ends with it ON so the .read of seed.sql in the SAME
-- session is protected; seed.sql repeats the PRAGMA so it is also safe when
-- run from a fresh connection. Remember to re-run it in any new session.
-- ============================================================================

-- OFF first: dropping a parent table with existing child rows is an implicit
-- DELETE FROM and would trip immediate FK errors. The official recipe is
-- "foreign keys off for the duration of schema changes, then back on".
PRAGMA foreign_keys = OFF;

-- Reverse dependency order: children before parents.
DROP TABLE IF EXISTS task_tags;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- users — the "one" side of 1:N with tasks.
-- id is INTEGER PRIMARY KEY: it aliases SQLite's hidden rowid, so it is stored
-- compactly, auto-generates, and lookups on it are direct. This is the key
-- shape Prisma expects for M07 (@id @default(autoincrement())).
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    -- Deliberately NOT a "password column of booleans" demo: hashes are TEXT.
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- CHECK teaches constraint failures with a visible, explainable rule.
    CONSTRAINT ck_users_email CHECK (email LIKE '%_@_%')
);

-- ----------------------------------------------------------------------------
-- tasks — the "many" side of 1:N with users.
-- * ON DELETE CASCADE: deleting a user takes their tasks with them (no orphans).
-- * UNIQUE (user_id, title): the M05 409-on-duplicate-title rule made DB-native —
--   one user may not hold two tasks with the same title, but two different
--   users both may (per-owner rule). The seed keeps titles globally unique
--   anyway, so M05's stricter global 409 is never contradicted by seed data;
--   the cross-owner allowance is proven live in constraint-proofs TEST 6.
-- * status is TEXT + CHECK: SQLite has no enum; the constraint is the enum.
-- * due_date TEXT NULL: ISO dates compare correctly as text (lexicographic =
--   chronological for YYYY-MM-DD), and NULL means "no due date" — which is what
--   learners will filter with IS NULL and see through LEFT JOINs.
-- * updated_at has a DEFAULT only: bumping it is an explicit UPDATE (no
--   triggers here; M07's Prisma @updatedAt takes that over).
-- * idx_tasks_user_id is created below; status is deliberately left UNINDEXED —
--   exercise 17 creates that index itself so EXPLAIN QUERY PLAN shows both
--   states.
-- ----------------------------------------------------------------------------
CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'todo'
                CONSTRAINT ck_tasks_status CHECK (status IN ('todo', 'in_progress', 'done')),
    due_date    TEXT,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tasks_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_tasks_user_title
        UNIQUE (user_id, title)
);

-- ----------------------------------------------------------------------------
-- tags — independent of users/tasks; the M:N relationship lives entirely in the
-- junction table, never as a column on tasks (that would be a 1:N mistake).
-- ----------------------------------------------------------------------------
CREATE TABLE tags (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- task_tags — the junction (bridge) table for M:N tasks <-> tags.
-- * Composite PRIMARY KEY (task_id, tag_id): a pair is either present once or
--   absent — the PK is what makes "same task, same tag" impossible to repeat.
--   A PK also implies NOT NULL on both columns, so no separate UNIQUE or
--   NOT NULL clauses are needed; adding them would be harmless but redundant.
-- * task_id -> CASCADE: deleting a task removes its junction rows.
-- * tag_id  -> RESTRICT, chosen deliberately against CASCADE: a tag that is
--   still attached to tasks CANNOT be deleted (the DB refuses), whereas an
--   unused tag deletes fine. This is the ON DELETE contrast pair to notice.
-- * The junction's PK covers queries leading with task_id; tag_id -> task
--   lookups need their own index (idx_task_tags_tag_id below).
-- ----------------------------------------------------------------------------
CREATE TABLE task_tags (
    task_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,

    PRIMARY KEY (task_id, tag_id),
    CONSTRAINT fk_task_tags_task
        FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_tags_tag
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- Indexes: only the join hot paths are pre-built. The rule of thumb to notice
-- here: index the columns you JOIN and FILTER on in the "many" table —
-- every FK column in a 1:N / M:N parent-side lookup is a candidate.
-- tasks.status stays unindexed on purpose (exercise 17 builds it).
-- ----------------------------------------------------------------------------
CREATE INDEX idx_tasks_user_id     ON tasks (user_id);
CREATE INDEX idx_task_tags_tag_id  ON task_tags (tag_id);
