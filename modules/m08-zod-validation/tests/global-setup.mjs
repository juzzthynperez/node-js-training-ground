// Jest globalSetup (M09) — runs ONCE, in the main Jest process, BEFORE any
// worker spawns. Plain .mjs on purpose: global-setup is infrastructure, not
// test code, and writing it as native ESM keeps it loadable without asking
// the transform pipeline to transform the file that configures the transform
// pipeline.
//
// What it does, and why:
//   1. Loads .env.test so DATABASE_URL points at test.db (dotenv never
//      overrides an env var that already exists, so an explicit value still
//      wins).
//   2. Deletes any test.db from a previous run. A test database is disposable
//      build output — rebuilding it from RECORDED HISTORY (migrate deploy on a
//      fresh file) is exactly m08's non-destructive pattern: replay the
//      migrations, never `migrate reset` (which would demand AI-guard consent
//      and rewrite history rather than replay it).
//   3. Runs `prisma migrate deploy` against that fresh file, so the suite
//      always starts from the schema the migrations actually record.
//
// Env vars set here do NOT reach the workers (they spawn after this function
// returns) — that is why tests/setup-env.mjs re-loads .env.test per worker.

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default async function globalSetup() {
  config({ path: path.join(rootDir, ".env.test"), quiet: true });

  const dbFile = path.join(rootDir, "test.db");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(dbFile + suffix, { force: true });
  }

  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
