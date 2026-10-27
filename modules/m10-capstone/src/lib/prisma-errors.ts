// src/lib/prisma-errors.ts — the service-seam mapping of Prisma's known
// request errors onto the M05 envelope hierarchy (M07's pattern, extracted
// because the capstone has FOUR services instead of one).
//
// It returns the mapped AppError or the ORIGINAL error unchanged, so callers
// `throw mapPrismaError(err, context)` and programmer errors stay 500s —
// nothing is laundered into a 4xx.

import { Prisma } from "../generated/prisma/client.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.ts";

export function mapPrismaError(err: unknown, context: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      // Unique constraint → the caller tried to create something that exists
      // (duplicate email on register, duplicate ISBN on create).
      case "P2002":
        return new ConflictError(`${context} already exists`);
      // Record missing on update/delete → the resource genuinely isn't there.
      case "P2025":
        return new NotFoundError(`${context} not found`);
      // Foreign key violation → the caller referenced a row that doesn't
      // exist. Bad reference, not a state clash: 400 (M07's decision).
      case "P2003":
        return new BadRequestError(`${context} references a resource that does not exist`);
    }
  }
  return err;
}
