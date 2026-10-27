// Jest setupFiles (M09 pattern, M10 carry-forward) — runs before EVERY test
// file module is evaluated in this worker (setupFiles re-run per test file —
// the setup must stay idempotent; it does: dotenv never re-injects over
// existing keys and the forced assignments below are constants).
//
// src/config.ts and src/db.ts read the environment AT MODULE LOAD or on each
// loadConfig() call, and dotenv never overrides a variable that already
// exists — so loading .env.test HERE, first, makes the later dev-env load a
// no-op and every client in this worker points at test.db with test
// credentials.
//
// Every credential is FORCED, not merely loaded: .env.test is gitignored by
// definition of done, so on a fresh CI checkout dotenv injects NOTHING —
// without the forced JWT_SECRET below, config.ts would correctly fail fast
// and every test would die on missing credentials. The suite's isolation and
// credentials must not depend on a file that is deliberately uncommitted.
//
// With --runInBand there is one worker and one test.db — the SQLite single-
// writer constraint the brief calls for.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(rootDir, ".env.test"), quiet: true });

// FORCE the test environment — no fallback, no escape hatch.
process.env.DATABASE_URL = "file:./test.db";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-not-a-real-credential-0123456789";
process.env.JWT_EXPIRES_IN = "15m";
// Bcrypt cost 4: hashing is on the hot path of the auth tests; the security
// property under test is HASHING PRESENT, not the work factor.
process.env.BCRYPT_ROUNDS = "4";
// A ceiling no test can reach accidentally — the rate-limit test overrides
// RATE_LIMIT_MAX itself (then restores it) before building its own app.
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
