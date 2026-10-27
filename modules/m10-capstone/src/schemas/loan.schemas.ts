// src/schemas/loan.schemas.ts — the request contract for borrowing/returning.
// Small on purpose: borrow needs exactly one field (which book), return needs
// only the path id, and the own-loans list has no query surface yet.

import { z } from "zod";

export const borrowSchema = z.object({
  bookId: z.uuid({ error: "bookId must be a UUID" }),
});

export const loanParamsSchema = z.object({
  id: z.uuid({ error: "id must be a UUID" }),
});

export type BorrowInput = z.infer<typeof borrowSchema>;
