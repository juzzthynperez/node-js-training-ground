// feat(crud) verification — books CRUD on REAL endpoints: the role boundary
// as a wrong-role REJECTION (MEMBER → 403, not just librarian succeeds),
// anonymous → 401, envelope error paths (409 duplicate isbn, 404s, 400
// gates), M:N management through the API, and the honest delete refusal for
// books with loan history.

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { getLibrarianToken, getMemberToken, testApp } from "./helpers/auth.ts";
import { resetDatabase } from "./helpers/db.ts";

beforeEach(async () => {
  await resetDatabase();
});

const NEW_BOOK = { title: "Dune", isbn: "978-0441172719" };

describe("GET /api/v1/books — reads require authentication", () => {
  it("anonymous → 401 (requireAuth on the real route)", async () => {
    const res = await request(testApp()).get("/api/v1/books");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("MEMBER can read the catalog (200)", async () => {
    const token = await getMemberToken();
    const res = await request(testApp())
      .get("/api/v1/books")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.meta).toBeDefined();
  });
});

describe("POST /api/v1/books — librarian-only creation (the role gate)", () => {
  it("anonymous → 401, never 403 (identity check comes first)", async () => {
    const res = await request(testApp()).post("/api/v1/books").send(NEW_BOOK);
    expect(res.status).toBe(401);
  });

  it("MEMBER → 403 FORBIDDEN: the wrong-role rejection, on a real endpoint", async () => {
    const token = await getMemberToken();
    const res = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send(NEW_BOOK);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message", "requestId"]);
    // And nothing was created by the refused call.
    expect(await prisma.book.count()).toBe(0);
  });

  it("LIBRARIAN → 201 with the view shape (authors: [])", async () => {
    const token = await getLibrarianToken();
    const res = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send(NEW_BOOK);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      title: "Dune",
      isbn: "978-0441172719",
      available: true,
      authors: [],
    });
  });

  it("creates with M:N authors attached, and GET shows them", async () => {
    const token = await getLibrarianToken();
    const a1 = await prisma.author.create({ data: { name: "Author One" } });
    const a2 = await prisma.author.create({ data: { name: "Author Two" } });

    const created = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...NEW_BOOK, authorIds: [a1.id, a2.id] });
    expect(created.status).toBe(201);
    expect(created.body.authors.map((a: { id: string }) => a.id).sort()).toEqual(
      [a1.id, a2.id].sort(),
    );

    const fetched = await request(testApp())
      .get(`/api/v1/books/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.authors).toHaveLength(2);
  });

  it("duplicate ISBN → 409 CONFLICT envelope", async () => {
    const token = await getLibrarianToken();
    await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send(NEW_BOOK)
      .expect(201);
    const res = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Dune Again", isbn: NEW_BOOK.isbn });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("empty title → 400 with details; unknown authorId → 400 (FK mapped)", async () => {
    const token = await getLibrarianToken();

    const badBody = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "   ", isbn: "isbn-x" });
    expect(badBody.status).toBe(400);
    expect(badBody.body.error.code).toBe("VALIDATION_ERROR");
    expect(badBody.body.error.details).toEqual([
      { path: "title", message: "title must be a non-empty string" },
    ]);

    const badAuthor = await request(testApp())
      .post("/api/v1/books")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...NEW_BOOK, authorIds: ["2b3c4d5e-0000-4000-8000-000000000000"] });
    expect(badAuthor.status).toBe(400);
    expect(badAuthor.body.error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.book.count()).toBe(0); // transaction rolled back as a unit
  });
});

describe("PATCH /api/v1/books/:id", () => {
  it("MEMBER → 403; LIBRARIAN → 200 with changes applied", async () => {
    const librarian = await getLibrarianToken();
    const member = await getMemberToken();
    const book = await prisma.book.create({ data: { title: "Old Title", isbn: "isbn-old" } });

    const denied = await request(testApp())
      .patch(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${member}`)
      .send({ title: "Vandalized" });
    expect(denied.status).toBe(403);

    const ok = await request(testApp())
      .patch(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({ title: "New Title", available: false });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe("New Title");
    expect(ok.body.available).toBe(false);
  });

  it("authorIds replaces the whole author set", async () => {
    const librarian = await getLibrarianToken();
    const a1 = await prisma.author.create({ data: { name: "First" } });
    const a2 = await prisma.author.create({ data: { name: "Second" } });
    const book = await prisma.book.create({ data: { title: "Relinked", isbn: "isbn-relink" } });
    await prisma.bookAuthor.create({ data: { bookId: book.id, authorId: a1.id } });

    const res = await request(testApp())
      .patch(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({ authorIds: [a2.id] });
    expect(res.status).toBe(200);
    expect(res.body.authors.map((a: { id: string }) => a.id)).toEqual([a2.id]);

    // Empty array = unlink all (the explicit "this book has no authors").
    const unlinkAll = await request(testApp())
      .patch(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({ authorIds: [] });
    expect(unlinkAll.status).toBe(200);
    expect(unlinkAll.body.authors).toEqual([]);
  });

  it("empty body → 400 (at least one field); unknown id → 404; bad uuid → 400", async () => {
    const librarian = await getLibrarianToken();

    const book = await prisma.book.create({ data: { title: "Patchable", isbn: "isbn-patch" } });
    const empty = await request(testApp())
      .patch(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.details?.[0]?.message).toContain("At least one field");

    const missing = await request(testApp())
      .patch("/api/v1/books/2b3c4d5e-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${librarian}`)
      .send({ title: "Ghost Edit" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");

    const badId = await request(testApp())
      .patch("/api/v1/books/not-a-uuid")
      .set("Authorization", `Bearer ${librarian}`)
      .send({ title: "x" });
    expect(badId.status).toBe(400);
    expect(badId.body.error.details?.[0]?.path).toBe("id");
  });
});

describe("DELETE /api/v1/books/:id", () => {
  it("MEMBER → 403 (deletion is curation, not borrowing)", async () => {
    const member = await getMemberToken();
    const book = await prisma.book.create({ data: { title: "Keep", isbn: "isbn-keep" } });
    const res = await request(testApp())
      .delete(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${member}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.book.count()).toBe(1);
  });

  it("LIBRARIAN → 204; second delete → 404", async () => {
    const librarian = await getLibrarianToken();
    const book = await prisma.book.create({ data: { title: "Temporary", isbn: "isbn-temp" } });

    await request(testApp())
      .delete(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .expect(204);

    const again = await request(testApp())
      .delete(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("NOT_FOUND");
  });

  it("a book with loan history → 409 CONFLICT (FK Restrict, honest message)", async () => {
    const librarian = await getLibrarianToken();
    const user = await prisma.user.create({
      data: { name: "Holder", email: "holder@library.test", passwordHash: "x" },
    });
    const book = await prisma.book.create({ data: { title: "Circulating", isbn: "isbn-circ" } });
    await prisma.loan.create({ data: { userId: user.id, bookId: book.id, dueAt: new Date() } });

    const res = await request(testApp())
      .delete(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${librarian}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toContain("loan history");
    expect(await prisma.book.count()).toBe(1); // the refusal left it intact
  });

  it("bad uuid → 400 before any role evaluation reaches the service", async () => {
    const librarian = await getLibrarianToken();
    const res = await request(testApp())
      .delete("/api/v1/books/nope")
      .set("Authorization", `Bearer ${librarian}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details?.[0].path).toBe("id");
  });
});
