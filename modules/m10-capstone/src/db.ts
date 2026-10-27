// db.ts — the single PrismaClient for the whole process.
//
// Two decisions carried from the M05 architecture into Prisma 7 (M07/M08
// pattern): ONE client instance constructed at module load (a PrismaClient
// per request leaks connection handles), and the driver adapter
// (better-sqlite3) is explicit — Prisma 7 clients do not open databases on
// their own; the adapter is the I/O layer.
//
// DATABASE_URL comes from .env (loaded here for runtime the same way
// prisma7.config.ts loads it for the CLI). tests/setup-env.mjs FORCES it to
// test.db before any test module imports this file.

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.ts";

const url = process.env["DATABASE_URL"] ?? "file:./dev.db";

const adapter = new PrismaBetterSqlite3({ url });

export const prisma = new PrismaClient({ adapter });
