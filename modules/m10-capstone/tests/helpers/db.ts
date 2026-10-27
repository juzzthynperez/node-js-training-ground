// Test-database helpers (M09 pattern) — the isolation machinery the real-DB
// strategy requires. Nothing here mocks anything: every function runs actual
// Prisma queries against test.db.

import { prisma } from "../../src/db.ts";

/**
 * Empty every table in FOREIGN-KEY-SAFE order (children first):
 *   loans (references books AND users) → book_authors (both) → books →
 *   authors → users. Mirrors prisma/seed.ts's parent/child discipline —
 * deleting a book while a loan still references it would be refused by the
 * loans FK (Restrict), so history rows go before their parents.
 *
 * Called from beforeEach: each test starts from an identical, empty database,
 * which is exactly what makes the suite order-independent (--randomize-safe).
 */
export async function resetDatabase(): Promise<void> {
  await prisma.loan.deleteMany();
  await prisma.bookAuthor.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.user.deleteMany();
}

export interface UserSeed {
  name: string;
  email: string;
  /** Password BEFORE hashing — the row stores a bcrypt hash, never this. */
  password: string;
  role?: "MEMBER" | "LIBRARIAN";
}

/**
 * Create a user row directly (no HTTP): role-gate and loan tests need a
 * librarian without provisioning one through registration each time.
 * The password is hashed here exactly like the service does — but the plain
 * value is not returned, so no test can accidentally assert against it.
 */
export async function createUserRow(seed: UserSeed): Promise<{
  id: string;
  name: string;
  email: string;
  role: string;
}> {
  const bcrypt = await import("bcrypt");
  return prisma.user.create({
    data: {
      name: seed.name,
      email: seed.email,
      passwordHash: await bcrypt.default.hash(seed.password, 4),
      role: seed.role ?? "MEMBER",
    },
  });
}
