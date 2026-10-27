// feat(db) verification — real client, real test.db, no mocks: proves the
// migrated schema's shape end-to-end (models exist, the M:N junction links,
// the unique constraints refuse duplicates, and a loan's FK binds to real
// rows). Complements the migration replay in global-setup: deploy proves the
// DDL, this proves the client can USE it.

import { beforeEach, describe, expect, it } from "@jest/globals";
import { prisma } from "../src/db.ts";

beforeEach(async () => {
  // Child-first delete order (junction → loans → books → authors → users),
  // the seed's discipline: FK policies must not be what stops a test.
  await prisma.loan.deleteMany();
  await prisma.bookAuthor.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.user.deleteMany();
});

describe("migrated schema (feat(db))", () => {
  it("creates a user with a role defaulting to MEMBER", async () => {
    const user = await prisma.user.create({
      data: { name: "Reader", email: "reader@test.local", passwordHash: "x" },
    });
    expect(user.role).toBe("MEMBER");
  });

  it("links two authors to one book through the explicit junction (M:N)", async () => {
    const book = await prisma.book.create({ data: { title: "Two Voices", isbn: "isbn-1" } });
    const a1 = await prisma.author.create({ data: { name: "Author One" } });
    const a2 = await prisma.author.create({ data: { name: "Author Two" } });
    await prisma.bookAuthor.createMany({
      data: [
        { bookId: book.id, authorId: a1.id },
        { bookId: book.id, authorId: a2.id },
      ],
    });

    const authors = await prisma.author.findMany({
      where: { books: { some: { bookId: book.id } } },
      orderBy: { name: "asc" },
    });
    expect(authors.map((a) => a.name)).toEqual(["Author One", "Author Two"]);
  });

  it("refuses duplicate ISBNs (unique constraint from the migration)", async () => {
    await prisma.book.create({ data: { title: "First", isbn: "dup-isbn" } });
    await expect(
      prisma.book.create({ data: { title: "Second", isbn: "dup-isbn" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("refuses a loan pointing at a book that does not exist (FK from the migration)", async () => {
    const user = await prisma.user.create({
      data: { name: "Ghost Borrower", email: "ghost@test.local", passwordHash: "x" },
    });
    await expect(
      prisma.loan.create({
        data: { userId: user.id, bookId: "no-such-book", dueAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("keeps a deleted book's loans honest: Restrict refuses when history exists", async () => {
    const user = await prisma.user.create({
      data: { name: "Borrower", email: "b@test.local", passwordHash: "x" },
    });
    const book = await prisma.book.create({ data: { title: "Contested", isbn: "isbn-r" } });
    await prisma.loan.create({ data: { userId: user.id, bookId: book.id, dueAt: new Date() } });

    await expect(prisma.book.delete({ where: { id: book.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });
});
