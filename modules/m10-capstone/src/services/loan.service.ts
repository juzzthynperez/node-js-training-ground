// src/services/loan.service.ts — the capstone's centerpiece (plan step 7).
//
// THE BUSINESS RULE: a book with an ACTIVE loan (returnedAt IS NULL) cannot
// be borrowed again. It is enforced HERE, inside prisma.$transaction, as one
// atomic read-check-write unit:
//
//   1. read the book            (404 if it doesn't exist)
//   2. count its active loans   (the rule — returnedAt NULL means "out")
//   3. create the loan row      (the evidence of borrowing)
//   4. flip book.available      (the list-filter cache, same tx)
//
// Why one transaction: steps 2→3 are check-then-write across two tables. Two
// concurrent borrowers that both pass step 2 before either reaches step 3
// double-book the copy. Inside a transaction the writes of one attempt are
// not visible to the other attempt's check — the loser observes the winner's
// COMMIT and answers 409 instead of silently overlapping. The BEFORE/AFTER
// under parallel load is captured by scripts/prove-race.ts (step 8), not
// asserted here.
//
// Return mirrors the discipline: mark returned, then re-enable availability
// only if no OTHER active loan exists (the flag can never disagree with the
// loan rows — both writes live in the same transaction).

import type { PrismaClient } from "../generated/prisma/client.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors.ts";
import { mapPrismaError } from "../lib/prisma-errors.ts";

const LOAN_PERIOD_DAYS = 14;

export interface LoanBookRef {
  id: string;
  title: string;
  available: boolean;
}

export interface LoanView {
  id: string;
  userId: string;
  bookId: string;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  createdAt: Date;
  book: LoanBookRef;
}

type LoanRow = {
  id: string;
  userId: string;
  bookId: string;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  createdAt: Date;
  book: { id: string; title: string; available: boolean };
};

function toLoanView(row: LoanRow): LoanView {
  return {
    id: row.id,
    userId: row.userId,
    bookId: row.bookId,
    borrowedAt: row.borrowedAt,
    dueAt: row.dueAt,
    returnedAt: row.returnedAt,
    createdAt: row.createdAt,
    book: row.book,
  };
}

const LOAN_INCLUDE = { book: { select: { id: true, title: true, available: true } } } as const;

export interface Requester {
  userId: string;
  role: string;
}

export class LoanService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Borrow: read → rule check → create → flip, atomically. */
  async borrow(requester: Requester, bookId: string): Promise<LoanView> {
    try {
      const loan = await this.prisma.$transaction(async (tx) => {
        const book = await tx.book.findUnique({ where: { id: bookId } });
        if (book === null) {
          throw new NotFoundError("Book not found");
        }

        // THE rule. Active loan ⇔ returnedAt IS NULL.
        const activeLoans = await tx.loan.count({ where: { bookId, returnedAt: null } });
        if (activeLoans > 0) {
          throw new ConflictError("Book already has an active loan");
        }

        const created = await tx.loan.create({
          data: {
            userId: requester.userId,
            bookId,
            dueAt: new Date(Date.now() + LOAN_PERIOD_DAYS * 24 * 60 * 60 * 1000),
          },
        });
        await tx.book.update({ where: { id: bookId }, data: { available: false } });
        return created;
      });

      const row = await this.prisma.loan.findUniqueOrThrow({
        where: { id: loan.id },
        include: LOAN_INCLUDE,
      });
      return toLoanView(row);
    } catch (err) {
      throw mapPrismaError(err, "Loan");
    }
  }

  /** Return: owner or LIBRARIAN; mark returned + restore availability atomically. */
  async returnLoan(requester: Requester, loanId: string): Promise<LoanView> {
    try {
      const loan = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.loan.findUnique({ where: { id: loanId } });
        if (existing === null) {
          throw new NotFoundError("Loan not found");
        }
        // Ownership boundary: a member returns their own loans; librarians
        // handle desk returns for anyone (the role difference, again).
        if (existing.userId !== requester.userId && requester.role !== "LIBRARIAN") {
          throw new ForbiddenError("You can only return your own loans");
        }
        if (existing.returnedAt !== null) {
          throw new ConflictError("Loan already returned");
        }

        const updated = await tx.loan.update({
          where: { id: loanId },
          data: { returnedAt: new Date() },
        });

        // Re-enable the book only when no OTHER active loan remains — the
        // flag is derived state, kept truthful by living in this transaction.
        const remaining = await tx.loan.count({
          where: { bookId: existing.bookId, returnedAt: null },
        });
        if (remaining === 0) {
          await tx.book.update({ where: { id: existing.bookId }, data: { available: true } });
        }
        return updated;
      });

      const row = await this.prisma.loan.findUniqueOrThrow({
        where: { id: loan.id },
        include: LOAN_INCLUDE,
      });
      return toLoanView(row);
    } catch (err) {
      throw mapPrismaError(err, "Loan");
    }
  }

  /** The caller's loans, newest first (MEMBER sees only their own — the
   *  where clause IS the authorization, set by the route from req.user). */
  async listMine(userId: string): Promise<LoanView[]> {
    const rows = await this.prisma.loan.findMany({
      where: { userId },
      orderBy: { borrowedAt: "desc" },
      include: LOAN_INCLUDE,
    });
    return rows.map(toLoanView);
  }
}
