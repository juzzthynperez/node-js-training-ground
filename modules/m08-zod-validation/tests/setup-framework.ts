// Jest setupFilesAfterEnv (M09) — runs per test file, after setup-env.mjs has
// pointed this worker at test.db and before the test file's own imports.
// Registering the Prisma disconnect ONCE here is what the brief's
// `afterAll(() => prisma.$disconnect())` looks like in practice: every suite
// gets it without each file repeating it, and the single client instance
// (db.ts's module-load singleton) closes cleanly when the suite finishes.

import { afterAll } from "@jest/globals";
import { prisma } from "../src/db.ts";

afterAll(async () => {
  await prisma.$disconnect();
});
