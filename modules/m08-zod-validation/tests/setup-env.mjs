// Jest setupFiles (M09) — runs before EVERY test file module is evaluated in
// this worker (Jest's setupFiles re-run per test file — the setup must stay
// idempotent; it does: dotenv never re-injects over existing keys and the
// forced assignment below is constant). That ordering is the entire point:
// src/db.ts reads
// DATABASE_URL AT MODULE LOAD, and dotenv (which it imports as
// `import "dotenv/config"`) never overrides a variable that already exists —
// so loading .env.test HERE, first, makes the later dev-env load a no-op and
// every prisma client in this worker points at test.db instead of dev.db.
//
// With --runInBand there is one worker and one test.db — the SQLite single-
// writer constraint the brief calls for.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(rootDir, ".env.test"), quiet: true });

// FORCE the test database — no fallback, no escape hatch. .env.test is
// gitignored by definition of done, so on a fresh CI checkout dotenv injects
// NOTHING and src/db.ts would fall back to file:./dev.db — where
// resetDatabase()'s deleteMany would empty the development data instead of
// the disposable test data. The suite's isolation must not depend on a file
// that is deliberately uncommitted: this worker points at test.db, always.
process.env.DATABASE_URL = "file:./test.db";
process.env.NODE_ENV = "test";
