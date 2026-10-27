// feat(loans) verification — the business rule, demonstrated not asserted:
//   * sequential: borrow → second borrow of the same book loses (409), one
//     winner, book flag follows the loan rows
//   * concurrent: five simultaneous borrows of ONE contested book → exactly
//     one 201 and the rest 409 (the test-level twin of scripts/prove-race.ts)
//   * round trip: return re-enables borrowing; double-return refused;
//     ownership boundary on return (other member 403, librarian desk 200)

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { getLibrarianToken, getMemberToken, testApp } from "./helpers/auth.ts";
import { resetDatabase } from "./helpers/db.ts";

let memberToken: string;
let otherMemberToken: string;

beforeEach(async () => {
  await resetDatabase();
  memberToken = await getMemberToken();
  otherMemberToken = await getMemberToken("other@library.test");
});

async function makeBook(title = "Contested Book", isbn = "isbn-contested") {
  return prisma.book.create({ data: { title, isbn } });
}

function borrow(token: string, bookId: string) {
  return request(testApp())
    .post("/api/v1/loans")
    .set("Authorization", `Bearer ${token}`)
    .send({ bookId });
}

describe("POST /api/v1/loans — borrowing", () => {
  it("anonymous → 401", async () => {
    const book = await makeBook();
    const res = await request(testApp()).post("/api/v1/loans").send({ bookId: book.id });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("borrows an available book: 201 loan + availability flips false", async () => {
    const book = await makeBook();
    const res = await borrow(memberToken, book.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: expect.any(String),
      bookId: book.id,
      returnedAt: null,
      book: { id: book.id, title: "Contested Book", available: false },
    });
    expect(typeof res.body.dueAt).toBe("string"); // loan period set

    const row = await prisma.book.findUnique({ where: { id: book.id } });
    expect(row?.available).toBe(false);
  });

  it("the rule: a book with an active loan cannot be borrowed again — exactly one winner", async () => {
    const book = await makeBook();

    const first = await borrow(memberToken, book.id);
    expect(first.status).toBe(201);

    const second = await borrow(otherMemberToken, book.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
    expect(second.body.error.message).toContain("active loan");

    // One loan row exists — the loser wrote nothing.
    expect(await prisma.loan.count({ where: { bookId: book.id } })).toBe(1);
  });

  it("even the same borrower cannot double-borrow their own active loan", async () => {
    const book = await makeBook();
    await borrow(memberToken, book.id).expect(201);
    const again = await borrow(memberToken, book.id);
    expect(again.status).toBe(409);
  });

  it("concurrent contention on ONE book: exactly one 201, the rest 409", async () => {
    const book = await makeBook();

    // Fire five borrows truly concurrently (five overlapping Supertest
    // requests), four identities + one repeat — none waits for another.
    const attempts = await Promise.all([
      borrow(memberToken, book.id),
      borrow(otherMemberToken, book.id),
      borrow(memberToken, book.id),
      borrow(otherMemberToken, book.id),
      borrow(memberToken, book.id),
    ]);

    const winners = attempts.filter((r) => r.status === 201);
    const losers = attempts.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(4);
    // Any other status (500, 400…) would mean the rule failed to answer —
    // assert the full partition so a silent 500 cannot hide among losers.
    expect(winners.length + losers.length).toBe(attempts.length);

    // And the database agrees: one loan, book out.
    expect(await prisma.loan.count({ where: { bookId: book.id } })).toBe(1);
    const row = await prisma.book.findUnique({ where: { id: book.id } });
    expect(row?.available).toBe(false);
  });

  it("unknown-but-valid book id → 404; malformed id → 400", async () => {
    const missing = await borrow(memberToken, "2b3c4d5e-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");

    const bad = await borrow(memberToken, "not-a-uuid");
    expect(bad.status).toBe(400);
    expect(bad.body.error.details?.[0].path).toBe("bookId");
  });

  it("a returned book becomes borrowable again (the flag and rule round-trip)", async () => {
    const book = await makeBook();
    const loan = await borrow(memberToken, book.id);
    expect(loan.status).toBe(201);

    await request(testApp())
      .post(`/api/v1/loans/${loan.body.id}/return`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);

    const row = await prisma.book.findUnique({ where: { id: book.id } });
    expect(row?.available).toBe(true);

    const reborrow = await borrow(otherMemberToken, book.id);
    expect(reborrow.status).toBe(201);
  });
});

describe("POST /api/v1/loans/:id/return", () => {
  it("another MEMBER's loan → 403 (ownership boundary)", async () => {
    const book = await makeBook();
    const loan = await borrow(memberToken, book.id);
    expect(loan.status).toBe(201);

    const res = await request(testApp())
      .post(`/api/v1/loans/${loan.body.id}/return`)
      .set("Authorization", `Bearer ${otherMemberToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    // Still out.
    expect((await prisma.book.findUnique({ where: { id: book.id } }))?.available).toBe(false);
  });

  it("LIBRARIAN performs a desk return for someone else's loan → 200", async () => {
    const book = await makeBook();
    const loan = await borrow(memberToken, book.id);
    const librarian = await getLibrarianToken();

    const res = await request(testApp())
      .post(`/api/v1/loans/${loan.body.id}/return`)
      .set("Authorization", `Bearer ${librarian}`);
    expect(res.status).toBe(200);
    expect(res.body.returnedAt).not.toBeNull();
    expect((await prisma.book.findUnique({ where: { id: book.id } }))?.available).toBe(true);
  });

  it("double return → 409 (the loan row records history exactly once)", async () => {
    const book = await makeBook();
    const loan = await borrow(memberToken, book.id);

    await request(testApp())
      .post(`/api/v1/loans/${loan.body.id}/return`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);

    const second = await request(testApp())
      .post(`/api/v1/loans/${loan.body.id}/return`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("unknown id → 404; malformed id → 400", async () => {
    const missing = await request(testApp())
      .post("/api/v1/loans/2b3c4d5e-0000-4000-8000-000000000000/return")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(missing.status).toBe(404);

    const bad = await request(testApp())
      .post("/api/v1/loans/nope/return")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details?.[0].path).toBe("id");
  });
});

describe("GET /api/v1/loans — own history only", () => {
  it("returns the caller's loans with book refs, never anyone else's", async () => {
    const bookA = await makeBook("Member A Book", "isbn-a");
    const bookB = await makeBook("Member B Book", "isbn-b");
    await borrow(memberToken, bookA.id).expect(201);
    await borrow(otherMemberToken, bookB.id).expect(201);

    const mine = await request(testApp())
      .get("/api/v1/loans")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].bookId).toBe(bookA.id);
    expect(mine.body.items[0].book).toEqual({
      id: bookA.id,
      title: "Member A Book",
      available: false,
    });

    const theirs = await request(testApp())
      .get("/api/v1/loans")
      .set("Authorization", `Bearer ${otherMemberToken}`);
    expect(theirs.body.items).toHaveLength(1);
    expect(theirs.body.items[0].bookId).toBe(bookB.id);
  });

  it("anonymous → 401", async () => {
    await request(testApp()).get("/api/v1/loans").expect(401);
  });

  it("returning ONE loan does not re-enable the book while another active loan exists (legacy rows)", async () => {
    // Rows written directly, bypassing the API: the rule normally prevents
    // two active loans on one book, but imported/legacy data can contain
    // them. The return path must derive availability from "any active
    // remains", not blindly flip the flag.
    const book = await makeBook("Doubly Loaned", "isbn-double");
    const loanA = await prisma.loan.create({
      data: { userId: (await prisma.user.findUnique({ where: { email: "member@library.test" } }))!.id, bookId: book.id, dueAt: new Date() },
    });
    await prisma.loan.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { email: "other@library.test" } }))!.id,
        bookId: book.id,
        dueAt: new Date(),
      },
    });
    await prisma.book.update({ where: { id: book.id }, data: { available: false } });

    const res = await request(testApp())
      .post(`/api/v1/loans/${loanA.id}/return`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);

    // One active loan remains → the book stays out.
    expect((await prisma.book.findUnique({ where: { id: book.id } }))?.available).toBe(false);
    expect(await prisma.loan.count({ where: { bookId: book.id, returnedAt: null } })).toBe(1);
  });
});
