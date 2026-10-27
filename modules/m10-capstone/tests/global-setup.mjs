// Jest globalSetup (M09 pattern) — runs ONCE, in the main Jest process,
// BEFORE any worker spawns. Plain .mjs on purpose: global-setup is
// infrastructure, not test code, and writing it as native ESM keeps it
// loadable without asking the transform pipeline to transform the file that
// configures the transform pipeline.
//
// Stage note (plan order): the skeleton stage only resets test.db — the
// `prisma migrate deploy` replay joins with feat(db), when migrations exist
// to replay (a deploy against no migrations would fail, and inventing a
// schema here would put step 3's design decision inside step 1's skeleton).
//
// What it does, and why:
//   1. Loads .env.test so DATABASE_URL points at test.db (dotenv never
//      overrides an env var that already exists, so an explicit value still
//      wins).
//   2. Deletes any test.db from a previous run. A test database is disposable
//      build output — rebuilding it from RECORDED HISTORY (migrate deploy on
//      a fresh file) is the non-destructive pattern: replay the migrations,
//      never `migrate reset` (which rewrites history rather than replaying it).

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
}
