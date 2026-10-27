// prisma/seed.ts — the capstone seed. Shape rule (M06 lesson): seeded rows
// are a TEACHING instrument — they must make every documented query and the
// business rule demonstrable on a fresh database, not merely fill tables.
//
// What this seed produces:
//   * two accounts: a LIBRARIAN (mutations allowed) and a MEMBER (borrowing)
//   * three authors — one book has TWO authors, so the M:N is visible
//   * six books, one already OUT (available=false with an active loan) and
//     one with a returned loan in history — both sides of the rule to teach
//
// Passwords are hashed with bcrypt exactly like the API does (cost 10);
// bcrypt salts, so hashes differ per run — that is correct, not a bug.

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import bcrypt from "bcrypt";

const adapter = new PrismaBetterSqlite3({ url: process.env["DATABASE_URL"] ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  // Idempotent: `npm run db:seed` twice must not duplicate rows (the unique
  // email/isbn constraints would make the second run fail loudly otherwise).
  await prisma.loan.deleteMany();
  await prisma.bookAuthor.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.user.deleteMany();

  const [librarian, member] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Ada Librarian",
        email: "librarian@library.test",
        passwordHash: await bcrypt.hash("librarian-pass-123", 10),
        role: "LIBRARIAN",
      },
    }),
    prisma.user.create({
      data: {
        name: "Milo Member",
        email: "member@library.test",
        passwordHash: await bcrypt.hash("member-pass-123", 10),
        role: "MEMBER",
      },
    }),
  ]);

  const [butler, leGuin, pratchett] = await Promise.all([
    prisma.author.create({ data: { name: "Octavia E. Butler", bio: "Speculative fiction pioneer." } }),
    prisma.author.create({ data: { name: "Ursula K. Le Guin", bio: "Earthsea and beyond." } }),
    prisma.author.create({ data: { name: "Terry Pratchett", bio: "Discworld, footnotes first." } }),
  ]);

  const [kindred, leftHand, discworld, earthsea, wildSeed, parable] = await Promise.all([
    prisma.book.create({ data: { title: "Kindred", isbn: "978-0807083697" } }),
    prisma.book.create({ data: { title: "The Left Hand of Darkness", isbn: "978-0441478125" } }),
    prisma.book.create({ data: { title: "Guards! Guards!", isbn: "978-0552159067" } }),
    prisma.book.create({ data: { title: "A Wizard of Earthsea", isbn: "978-0553383041" } }),
    prisma.book.create({ data: { title: "Wild Seed", isbn: "978-0807083697-2" } }),
    prisma.book.create({ data: { title: "Parable of the Sower", isbn: "978-0446675505" } }),
  ]);

  // M:N demonstration: The Left Hand of Darkness co-attributed in this
  // fictional catalog so a JOIN across book_authors returns more than one
  // author row for a single book.
  await prisma.bookAuthor.createMany({
    data: [
      { bookId: kindred.id, authorId: butler.id },
      { bookId: wildSeed.id, authorId: butler.id },
      { bookId: parable.id, authorId: butler.id },
      { bookId: leftHand.id, authorId: leGuin.id },
      { bookId: leftHand.id, authorId: pratchett.id },
      { bookId: earthsea.id, authorId: leGuin.id },
      { bookId: discworld.id, authorId: pratchett.id },
    ],
  });

  // One book OUT (active loan, available=false) and one returned (history,
  // available=true) — the before/after states the business rule teaches.
  await prisma.loan.create({
    data: {
      userId: member.id,
      bookId: kindred.id,
      borrowedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.book.update({ where: { id: kindred.id }, data: { available: false } });

  await prisma.loan.create({
    data: {
      userId: member.id,
      bookId: discworld.id,
      borrowedAt: new Date(Date.now() - 2 * WEEK_MS),
      dueAt: new Date(Date.now() - WEEK_MS),
      returnedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  const [users, authors, books, links, loans] = await Promise.all([
    prisma.user.count(),
    prisma.author.count(),
    prisma.book.count(),
    prisma.bookAuthor.count(),
    prisma.loan.count(),
  ]);
  console.log(`seeded: ${users} users, ${authors} authors, ${books} books, ${links} book-author links, ${loans} loans`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
