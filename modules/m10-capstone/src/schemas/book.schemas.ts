// src/schemas/book.schemas.ts — the request contract for books (CRUD + list).
//
// Zod owns every input type: routes pass these schemas to validate() and read
// them back through getValid(); no hand-written interfaces anywhere.
//
// Decisions:
//   * Bodies are non-strict objects → unknown keys are STRIPPED (M07/M08
//     create-parity: the parsed body simply has no other field to pass on).
//   * PATCH semantics: at least one OWN field must be present — an empty body
//     (or unknown-keys-only body, which strips to {}) is a 400, not a silent
//     no-op (M08's patch-empty rule).
//   * The list query's ints use an EXACT positive-integer gate
//     (/^[1-9][0-9]*$/) before coercion: "007", "1e3", "0" and "-1" are 400s,
//     the M08 int-gate lesson. Filters are optional; page/pageSize/sort/order
//     carry defaults so a bare GET /books is a valid request.
//   * `available` arrives as the literal query strings "true"/"false" and is
//     transformed to a real boolean — anything else is a 400 (no silent
//     truthiness on query text).

import { z } from "zod";

const TITLE_MESSAGE = "title must be a non-empty string";
const ISBN_MESSAGE = "isbn must be a non-empty string";

/** Exact-digit gate: parse only after the string proves itself. */
const positiveIntParam = (label: string, max: number, fallback: number) =>
  z
    .string({ error: `${label} must be an integer` })
    .regex(/^[1-9][0-9]*$/, { error: `${label} must be a positive integer` })
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int({ error: `${label} must be an integer` }).max(max, { error: `${label} must be at most ${max}` }))
    .default(fallback);

const uuidMessage = "must be a UUID";

export const bookParamsSchema = z.object({
  id: z.uuid({ error: `id ${uuidMessage}` }),
});

export const createBookSchema = z.object({
  title: z.string({ error: TITLE_MESSAGE }).trim().min(1, { error: TITLE_MESSAGE }).max(200, {
    error: "title must be at most 200 characters",
  }),
  isbn: z.string({ error: ISBN_MESSAGE }).trim().min(1, { error: ISBN_MESSAGE }).max(20, {
    error: "isbn must be at most 20 characters",
  }),
  // Optional M:N links: create the book AND attach these authors atomically.
  // Bad ids fall through to the Prisma FK (P2003 → 400 via the shared seam),
  // duplicate ids are de-duplicated here so createMany never trips its own
  // composite key (P2001, which no message maps).
  authorIds: z.array(z.uuid({ error: `authorIds entries must be UUIDs` })).max(20, {
    error: "authorIds accepts at most 20 entries",
  }).optional(),
});

export const updateBookSchema = z
  .object({
    title: z.string({ error: TITLE_MESSAGE }).trim().min(1, { error: TITLE_MESSAGE }).max(200, {
      error: "title must be at most 200 characters",
    }).optional(),
    isbn: z.string({ error: ISBN_MESSAGE }).trim().min(1, { error: ISBN_MESSAGE }).max(20, {
      error: "isbn must be at most 20 characters",
    }).optional(),
    available: z.boolean({ error: "available must be a boolean" }).optional(),
    // Replaces the whole author set (the explicit "these are its authors"
    // statement) — empty array = unlink all.
    authorIds: z.array(z.uuid({ error: `authorIds entries must be UUIDs` })).max(20, {
      error: "authorIds accepts at most 20 entries",
    }).optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.isbn !== undefined ||
      body.available !== undefined ||
      body.authorIds !== undefined,
    { error: "At least one field to update is required (title, isbn, available, authorIds)" },
  );

/** GET /books query — filters optional, paging/sorting defaulted. */
export const listBooksQuerySchema = z.object({
  title: z.string({ error: "title filter must be a string" }).trim().min(1, {
    error: "title filter must be a non-empty string",
  }).max(200, { error: "title filter must be at most 200 characters" }).optional(),
  authorId: z.uuid({ error: `authorId ${uuidMessage}` }).optional(),
  available: z.enum(["true", "false"], { error: "available must be exactly 'true' or 'false'" })
    .transform((value) => value === "true")
    .optional(),
  page: positiveIntParam("page", 1_000_000, 1),
  pageSize: positiveIntParam("pageSize", 100, 10),
  sort: z.enum(["title", "createdAt"], {
    error: "sort must be one of: title, createdAt",
  }).default("title"),
  order: z.enum(["asc", "desc"], { error: "order must be one of: asc, desc" }).default("asc"),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.output<typeof listBooksQuerySchema>;
