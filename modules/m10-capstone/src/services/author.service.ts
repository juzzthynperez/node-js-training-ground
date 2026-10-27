// src/services/author.service.ts — authors CRUD.
//
// Simpler than books by design: no unique constraints and no incoming FKs,
// so create has no 409 case and the only failures are 404s (update/delete of
// a missing author, via the shared P2025 mapping). Deleting an author is
// allowed even when books link to it: the junction rows Cascade away while
// the BOOKS survive — a catalog entry outlives the removal of one author
// attribution (schema policy, asserted in tests/authors.test.ts).

import type { PrismaClient } from "../generated/prisma/client.ts";
import { NotFoundError } from "../errors.ts";
import { mapPrismaError } from "../lib/prisma-errors.ts";
import type { CreateAuthorInput, UpdateAuthorInput } from "../schemas/author.schemas.ts";

export interface BookRef {
  id: string;
  title: string;
  isbn: string;
  available: boolean;
}

export interface AuthorView {
  id: string;
  name: string;
  bio: string;
  createdAt: Date;
}

export interface AuthorDetail extends AuthorView {
  books: BookRef[];
}

type AuthorRow = { id: string; name: string; bio: string; createdAt: Date };

function toAuthorView(row: AuthorRow): AuthorView {
  return { id: row.id, name: row.name, bio: row.bio, createdAt: row.createdAt };
}

export class AuthorService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async list(): Promise<AuthorView[]> {
    const rows = await this.prisma.author.findMany({ orderBy: { name: "asc" } });
    return rows.map(toAuthorView);
  }

  async getById(id: string): Promise<AuthorDetail> {
    const row = await this.prisma.author.findUnique({
      where: { id },
      include: { books: { include: { book: true } } },
    });
    if (row === null) {
      throw new NotFoundError("Author not found");
    }
    return {
      ...toAuthorView(row),
      books: row.books.map((link) => ({
        id: link.book.id,
        title: link.book.title,
        isbn: link.book.isbn,
        available: link.book.available,
      })),
    };
  }

  async create(input: CreateAuthorInput): Promise<AuthorView> {
    try {
      const row = await this.prisma.author.create({
        data: { name: input.name, bio: input.bio ?? "" },
      });
      return toAuthorView(row);
    } catch (err) {
      throw mapPrismaError(err, "Author");
    }
  }

  async update(id: string, input: UpdateAuthorInput): Promise<AuthorView> {
    try {
      const row = await this.prisma.author.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
        },
      });
      return toAuthorView(row);
    } catch (err) {
      throw mapPrismaError(err, "Author"); // P2025 → 404
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.author.delete({ where: { id } });
    } catch (err) {
      throw mapPrismaError(err, "Author"); // P2025 → 404
    }
  }
}
