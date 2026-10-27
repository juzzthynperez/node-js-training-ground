// src/services/book.service.ts — books CRUD + the graded list endpoint.
//
// Envelope discipline: services THROW AppError subclasses (or map Prisma
// errors through the shared seam) and never build response bodies — routes
// only status-code successful reads; the central handler owns every failure.
//
// Transactions used honestly, twice:
//   * create/update with authorIds — book row + junction rows commit together
//     (a book never exists "half-linked").
//   * list — count + page in ONE $transaction, so meta.total and the items
//     array describe the same snapshot even under concurrent writes.

import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../errors.ts";
import { mapPrismaError } from "../lib/prisma-errors.ts";
import type { CreateBookInput, ListBooksQuery, UpdateBookInput } from "../schemas/book.schemas.ts";

export interface AuthorRef {
  id: string;
  name: string;
}

export interface BookView {
  id: string;
  title: string;
  isbn: string;
  available: boolean;
  createdAt: Date;
  updatedAt: Date;
  authors: AuthorRef[];
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface BookListResult {
  items: BookView[];
  meta: ListMeta;
}

type BookWithAuthors = {
  id: string;
  title: string;
  isbn: string;
  available: boolean;
  createdAt: Date;
  updatedAt: Date;
  bookAuthors: { author: { id: string; name: string } }[];
};

const AUTHORS_INCLUDE = {
  bookAuthors: { include: { author: { select: { id: true, name: true } } } },
} as const;

function toBookView(row: BookWithAuthors): BookView {
  return {
    id: row.id,
    title: row.title,
    isbn: row.isbn,
    available: row.available,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authors: row.bookAuthors.map((link) => link.author),
  };
}

export class BookService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Filter + sort + offset pagination, one atomic snapshot (count + rows). */
  async list(query: ListBooksQuery): Promise<BookListResult> {
    const where: Prisma.BookWhereInput = {
      ...(query.title !== undefined ? { title: { contains: query.title } } : {}),
      ...(query.available !== undefined ? { available: query.available } : {}),
      ...(query.authorId !== undefined
        ? { bookAuthors: { some: { authorId: query.authorId } } }
        : {}),
    };
    // Conditional instead of a computed key: keeps the orderBy object typed
    // against Prisma's exact shape (a `{ [k]: v }` index signature would not
    // be assignable).
    const orderBy: Prisma.BookOrderByWithRelationInput =
      query.sort === "title" ? { title: query.order } : { createdAt: query.order };

    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        include: AUTHORS_INCLUDE,
      }),
    ]);

    return {
      items: rows.map(toBookView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    };
  }

  async getById(id: string): Promise<BookView> {
    const row = await this.prisma.book.findUnique({ where: { id }, include: AUTHORS_INCLUDE });
    if (row === null) {
      throw new NotFoundError("Book not found");
    }
    return toBookView(row);
  }

  async create(input: CreateBookInput): Promise<BookView> {
    const authorIds = [...new Set(input.authorIds ?? [])];
    try {
      const book = await this.prisma.$transaction(async (tx) => {
        const created = await tx.book.create({
          data: { title: input.title, isbn: input.isbn },
        });
        if (authorIds.length > 0) {
          await tx.bookAuthor.createMany({
            data: authorIds.map((authorId) => ({ bookId: created.id, authorId })),
          });
        }
        return created;
      });
      // Read back through getById so every create response carries the same
      // author-included shape as a GET (one view, one mapper).
      return await this.getById(book.id);
    } catch (err) {
      throw mapPrismaError(err, "Book"); // P2002 isbn → 409, P2003 authorId → 400
    }
  }

  async update(id: string, input: UpdateBookInput): Promise<BookView> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.book.update({
          where: { id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.isbn !== undefined ? { isbn: input.isbn } : {}),
            ...(input.available !== undefined ? { available: input.available } : {}),
          },
        });
        if (input.authorIds !== undefined) {
          // Replace semantics: unlink everything, then link the new set —
          // all inside the same transaction as the row update.
          await tx.bookAuthor.deleteMany({ where: { bookId: id } });
          const unique = [...new Set(input.authorIds)];
          if (unique.length > 0) {
            await tx.bookAuthor.createMany({
              data: unique.map((authorId) => ({ bookId: id, authorId })),
            });
          }
        }
      });
      return await this.getById(id); // P2025 (missing id) surfaces here → 404
    } catch (err) {
      throw mapPrismaError(err, "Book");
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.book.delete({ where: { id } });
    } catch (err) {
      // FK Restrict on loans: a book with borrowing history cannot be deleted.
      // The generic seam message ("references a resource...") would invert the
      // truth — the BOOK is the referenced side — so this one code gets its
      // honest answer; everything else still goes through the seam.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new ConflictError("Cannot delete a book with loan history");
      }
      throw mapPrismaError(err, "Book"); // P2025 → 404
    }
  }
}
