// db.ts — the single PrismaClient for the whole process.
//
// Two decisions carried from the M05 architecture into Prisma 7:
//   * ONE client instance, constructed at module load: a PrismaClient per
//     request leaks connection handles and defeats prepared-statement reuse.
//   * The driver adapter (better-sqlite3) is explicit — Prisma 7 clients do
//     not open databases on their own; the adapter is the I/O layer.
//
// DATABASE_URL comes from .env (loaded here for runtime the same way
// prisma7.config.ts loads it for the CLI). The default points at the same
// file the migrations created.

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.ts";

const url = process.env["DATABASE_URL"] ?? "file:./dev.db";

const adapter = new PrismaBetterSqlite3({ url });

export const prisma = new PrismaClient({ adapter });
