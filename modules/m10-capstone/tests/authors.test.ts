// feat(crud) verification — authors CRUD: same authorization map as books
// (401 anonymous, 403 MEMBER on mutations), detail view with M:N books, and
// the Cascade delete policy — removing an author unlinks junction rows while
// the BOOKS survive.

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { getLibrarianToken, getMemberToken, testApp } from "./helpers/auth.ts";
import { resetDatabase } from "./helpers/db.ts";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/v1/authors", () => {
  it("anonymous → 401; MEMBER → 200 list", async () => {
    await request(testApp()).get("/api/v1/authors").expect(401);

    const token = await getMemberToken();
    const res = await request(testApp())
      .get("/api/v1/authors")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("detail view includes the author's books (M:N from the other side)", async () => {
    const token = await getMemberToken();
    const author = await prisma.author.create({ data: { name: "Le Guin-esque" } });
    const book = await prisma.book.create({ data: { title: "Earthsea-ish", isbn: "isbn-es" } });
    await prisma.bookAuthor.create({ data: { bookId: book.id, authorId: author.id } });

    const res = await request(testApp())
      .get(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.books).toEqual([
      { id: book.id, title: "Earthsea-ish", isbn: "isbn-es", available: true },
    ]);
  });

  it("unknown-but-valid id → 404; malformed id → 400", async () => {
    const token = await getMemberToken();
    const missing = await request(testApp())
      .get("/api/v1/authors/2b3c4d5e-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);

    const bad = await request(testApp())
      .get("/api/v1/authors/definitely-not-a-uuid")
      .set("Authorization", `Bearer ${token}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details?.[0].path).toBe("id");
  });
});

describe("POST /api/v1/authors", () => {
  it("MEMBER → 403 FORBIDDEN (role gate on the second resource too)", async () => {
    const member = await getMemberToken();
    const res = await request(testApp())
      .post("/api/v1/authors")
      .set("Authorization", `Bearer ${member}`)
      .send({ name: "New Name" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.author.count()).toBe(0);
  });

  it("LIBRARIAN → 201; name must be non-empty → 400 with details", async () => {
    const librarian = await getLibrarianToken();

    const ok = await request(testApp())
      .post("/api/v1/authors")
      .set("Authorization", `Bearer ${librarian}`)
      .send({ name: "Octavia E. Butler", bio: "Speculative fiction pioneer." });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ id: expect.any(String), name: "Octavia E. Butler", bio: "Speculative fiction pioneer." });

    const bad = await request(testApp())
      .post("/api/v1/authors")
      .set("Authorization", `Bearer ${librarian}`)
      .send({ name: "  " });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([{ path: "name", message: "name must be a non-empty string" }]);
  });
});

describe("PATCH /api/v1/authors/:id", () => {
  it("LIBRARIAN updates; empty body → 400; missing → 404; MEMBER → 403", async () => {
    const librarian = await getLibrarianToken();
    const member = await getMemberToken();
    const author = await prisma.author.create({ data: { name: "Before" } });

    const denied = await request(testApp())
      .patch(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${member}`)
      .send({ name: "Vandal" });
    expect(denied.status).toBe(403);

    const empty = await request(testApp())
      .patch(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({});
    expect(empty.status).toBe(400);

    const ok = await request(testApp())
      .patch(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .send({ name: "After", bio: "Updated bio" });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe("After");
    expect(ok.body.bio).toBe("Updated bio");

    const missing = await request(testApp())
      .patch("/api/v1/authors/2b3c4d5e-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${librarian}`)
      .send({ name: "Ghost" });
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /api/v1/authors/:id — Cascade policy", () => {
  it("deleting an author keeps its books, unlinking only the junction rows", async () => {
    const librarian = await getLibrarianToken();
    const author = await prisma.author.create({ data: { name: "Removable" } });
    const book = await prisma.book.create({ data: { title: "Survives", isbn: "isbn-surv" } });
    await prisma.bookAuthor.create({ data: { bookId: book.id, authorId: author.id } });

    const res = await request(testApp())
      .delete(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${librarian}`);
    expect(res.status).toBe(204);

    // Junction cascaded away; the book row survives and is now authorless.
    expect(await prisma.bookAuthor.count()).toBe(0);
    expect(await prisma.book.count()).toBe(1);

    const token = await getMemberToken();
    const fetched = await request(testApp())
      .get(`/api/v1/books/${book.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.authors).toEqual([]);
  });

  it("second delete → 404; MEMBER → 403", async () => {
    const librarian = await getLibrarianToken();
    const member = await getMemberToken();
    const author = await prisma.author.create({ data: { name: "Twice" } });

    const denied = await request(testApp())
      .delete(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${member}`);
    expect(denied.status).toBe(403);

    await request(testApp())
      .delete(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${librarian}`)
      .expect(204);
    const again = await request(testApp())
      .delete(`/api/v1/authors/${author.id}`)
      .set("Authorization", `Bearer ${librarian}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("NOT_FOUND");
  });
});
