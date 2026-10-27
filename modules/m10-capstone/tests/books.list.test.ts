// feat(crud) verification — THE graded list endpoint: filtering, sorting,
// offset pagination, all through its Zod-validated query (with the M08
// int-gate lesson: "007", "1e3", "0" are 400s). Rows are seeded directly so
// every assertion compares against known, fixed data.

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { getMemberToken, testApp } from "./helpers/auth.ts";
import { resetDatabase } from "./helpers/db.ts";

const DAY = 24 * 60 * 60 * 1000;

/** Four books: distinct titles for sort, distinct createdAt for time sort,
 *  one unavailable, one with two authors, spread across three authors. */
async function seedCatalog(): Promise<{ a1: string; a2: string; a3: string }> {
  const a1 = await prisma.author.create({ data: { name: "Alice Alpha" } });
  const a2 = await prisma.author.create({ data: { name: "Bob Beta" } });
  const a3 = await prisma.author.create({ data: { name: "Cara Gamma" } });

  const books = [
    { title: "Ant Colony Economics", isbn: "isbn-ant", available: true, createdAt: new Date(Date.now() - 4 * DAY), authors: [a1.id] },
    { title: "Zebra Stripes", isbn: "isbn-zebra", available: true, createdAt: new Date(Date.now() - 3 * DAY), authors: [a1.id] },
    { title: "The Moon Is a Harsh Mistress", isbn: "isbn-moon", available: false, createdAt: new Date(Date.now() - 2 * DAY), authors: [a2.id] },
    { title: "Sailing Alone Around the World", isbn: "isbn-sail", available: true, createdAt: new Date(Date.now() - 1 * DAY), authors: [a2.id, a3.id] },
  ];
  for (const book of books) {
    const created = await prisma.book.create({
      data: {
        title: book.title,
        isbn: book.isbn,
        available: book.available,
        createdAt: book.createdAt,
      },
    });
    for (const authorId of book.authors) {
      await prisma.bookAuthor.create({ data: { bookId: created.id, authorId } });
    }
  }
  return { a1: a1.id, a2: a2.id, a3: a3.id };
}

async function list(query = "", token?: string): Promise<request.Response> {
  const auth = token ?? (await getMemberToken());
  return request(testApp())
    .get(`/api/v1/books${query}`)
    .set("Authorization", `Bearer ${auth}`);
}

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await getMemberToken();
});

describe("GET /api/v1/books — shape", () => {
  it("answers {items, meta} with defaults (page 1, pageSize 10)", async () => {
    await seedCatalog();
    const res = await list("", token);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 4, totalPages: 1 });
    // Each item carries its M:N authors.
    const sailing = res.body.items.find((b: { title: string }) => b.title.startsWith("Sailing"));
    expect(sailing.authors).toHaveLength(2);
  });

  it("empty catalog is an empty page, not an error", async () => {
    const res = await list("", token);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });
});

describe("GET /api/v1/books — filtering", () => {
  it("title contains (case-insensitive on SQLite)", async () => {
    await seedCatalog();
    const res = await list("?title=ZEB", token);
    expect(res.status).toBe(200);
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(["Zebra Stripes"]);
    expect(res.body.meta.total).toBe(1);
  });

  it("available=false returns only the book that is out", async () => {
    await seedCatalog();
    const res = await list("?available=false", token);
    expect(res.status).toBe(200);
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual([
      "The Moon Is a Harsh Mistress",
    ]);

    const all = await list("?available=true", token);
    expect(all.body.items).toHaveLength(3);
  });

  it("authorId narrows to that author's books (M:N aware)", async () => {
    const { a1, a3 } = await seedCatalog();

    const onlyA3 = await list(`?authorId=${a3}`, token);
    expect(onlyA3.body.items.map((b: { title: string }) => b.title)).toEqual([
      "Sailing Alone Around the World",
    ]);

    const bothByA1 = await list(`?authorId=${a1}`, token);
    expect(bothByA1.body.items).toHaveLength(2); // Ant + Zebra
  });

  it("filters combine (author + available)", async () => {
    const { a1 } = await seedCatalog();
    const res = await list(`?authorId=${a1}&available=false`, token);
    expect(res.body.items).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

describe("GET /api/v1/books — sorting", () => {
  it("title asc (default) and title desc are exact reverses", async () => {
    await seedCatalog();
    const asc = await list("?sort=title&order=asc", token);
    const desc = await list("?sort=title&order=desc", token);
    expect(asc.body.items.map((b: { title: string }) => b.title)).toEqual([
      "Ant Colony Economics",
      "Sailing Alone Around the World",
      "The Moon Is a Harsh Mistress",
      "Zebra Stripes",
    ]);
    expect(desc.body.items.map((b: { title: string }) => b.title)).toEqual(
      [...asc.body.items.map((b: { title: string }) => b.title)].reverse(),
    );
  });

  it("createdAt desc puts the newest first", async () => {
    await seedCatalog();
    const res = await list("?sort=createdAt&order=desc", token);
    expect(res.body.items[0].title).toBe("Sailing Alone Around the World");
  });
});

describe("GET /api/v1/books — offset pagination", () => {
  it("page 1 then page 2 partition the catalog (meta stays truthful)", async () => {
    await seedCatalog();
    const first = await list("?pageSize=2&page=1", token);
    expect(first.body.items.map((b: { title: string }) => b.title)).toEqual([
      "Ant Colony Economics",
      "Sailing Alone Around the World",
    ]);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });

    const second = await list("?pageSize=2&page=2", token);
    expect(second.body.items.map((b: { title: string }) => b.title)).toEqual([
      "The Moon Is a Harsh Mistress",
      "Zebra Stripes",
    ]);
    expect(second.body.meta.page).toBe(2);
  });

  it("a page past the end returns empty items with honest meta", async () => {
    await seedCatalog();
    const res = await list("?pageSize=2&page=99", token);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.meta).toEqual({ page: 99, pageSize: 2, total: 4, totalPages: 2 });
  });
});

describe("GET /api/v1/books — the query gate", () => {
  it.each([
    ["?page=007", "leading-zero int"],
    ["?page=1e3", "scientific notation"],
    ["?page=0", "zero page"],
    ["?pageSize=101", "pageSize above the 100 cap"],
    ["?pageSize=abc", "non-numeric pageSize"],
    ["?sort=available", "unsortable field"],
    ["?order=sideways", "unknown direction"],
    ["?available=maybe", "non-literal boolean"],
    ["?authorId=not-a-uuid", "malformed author id"],
    ["?title=", "empty title filter"],
  ])("%s → 400 (%s)", async (query) => {
    const res = await list(query, token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details?.length).toBeGreaterThan(0);
  });
});
