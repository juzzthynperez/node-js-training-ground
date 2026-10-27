// Jest globalSetup (M09 pattern) — runs ONCE, in the main Jest process,
// BEFORE any worker spawns. Plain .mjs on purpose: global-setup is
// infrastructure, not test code, and writing it as native ESM keeps it
// loadable without asking the transform pipeline to transform the file that
// configures the transform pipeline.
//
// Stage note (plan order): with feat(db) landed, globalSetup now REPLAYS the
// migrations onto the fresh file — `prisma migrate deploy` — so every run
// starts from the schema the migration history actually records (never
// `migrate reset`, which rewrites history rather than replaying it).
//
// What it does, and why:
//   1. Loads .env.test so DATABASE_URL points at test.db (dotenv never
//      overrides an env var that already exists, so an explicit value still
//      wins).
//   2. Deletes any test.db from a previous run. A test database is disposable
//      build output — rebuilding it from RECORDED HISTORY is the
//      non-destructive pattern.
//   3. Runs `prisma migrate deploy` against that fresh file.

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
