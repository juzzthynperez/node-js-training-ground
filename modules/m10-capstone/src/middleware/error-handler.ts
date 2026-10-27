// The central error handler — the ONE place every error ends up.
// Express recognizes error middleware by its 4-argument signature; in Express 5,
// rejected promises from async handlers land here automatically (no try/catch).
// Wire shape is the frozen envelope from brief.md. Carried from M08 (whose
// ZodError branch and malformed-JSON branch are reproduced faithfully) — the
// capstone adds nothing here; auth errors enter through the AppError branch
// like every other operational error.

import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, type ErrorDetail, type ErrorEnvelope } from "../errors.ts";

export interface ErrorHandlerOptions {
  /** When true, programmer-error details (stack, unexpected message) are hidden. */
  isProduction: boolean;
}

export function errorHandlerFactory(options: ErrorHandlerOptions): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, next): void => {
    if (res.headersSent) {
      // Too late to build an envelope — hand off to Express's default handler.
      next(err);
      return;
    }

    const requestId = req.requestId;

    if (err instanceof AppError) {
      const envelope: ErrorEnvelope = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details.length > 0 ? { details: err.details } : {}),
          ...(requestId !== undefined ? { requestId } : {}),
        },
      };
      res.status(err.status).json(envelope);
      return;
    }

    // ZodError is operational too — it can only come from validate() (or the
    // startup env schema) rejecting input, which is exactly the 400 case.
    // One Zod issue -> one { path, message } detail: the envelope's frozen
    // details[] shape, MAPPED, not reshaped. unrecognized_keys expands to one
    // detail PER key and sorts FIRST (the M07 ordering: unknown keys before
    // field checks, which Zod's native issue order does not match).
    if (err instanceof ZodError) {
      const mapIssue = (issue: (typeof err.issues)[number]): ErrorDetail[] =>
        issue.code === "unrecognized_keys"
          ? issue.keys.map((key) => ({
              path: [...issue.path, key].join("."),
              message: "Unknown field",
            }))
          : [{ path: issue.path.join("."), message: issue.message }];
      const details: ErrorDetail[] = [
        ...err.issues.filter((issue) => issue.code === "unrecognized_keys").flatMap(mapIssue),
        ...err.issues.filter((issue) => issue.code !== "unrecognized_keys").flatMap(mapIssue),
      ];
      const envelope: ErrorEnvelope = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          ...(details.length > 0 ? { details } : {}),
          ...(requestId !== undefined ? { requestId } : {}),
        },
      };
      res.status(400).json(envelope);
      return;
    }

    // body-parser's JSON SyntaxError is a CLIENT error, not a programmer error.
    // express.json() marks it with type "entity.parse.failed"; without this
    // branch it falls through to the 500 below — answering INTERNAL_ERROR for
    // a broken request body. Malformed JSON answers the same frozen
    // validation envelope every 400 uses, with no details (there is no field
    // path — the body never parsed far enough to have one).
    if (
      err instanceof SyntaxError &&
      "type" in err &&
      (err as SyntaxError & { type?: string }).type === "entity.parse.failed"
    ) {
      const envelope: ErrorEnvelope = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Body must be valid JSON",
          ...(requestId !== undefined ? { requestId } : {}),
        },
      };
      res.status(400).json(envelope);
      return;
    }

    // Programmer error (or anything we didn't anticipate): log the full truth,
    // respond with a fixed 500 that leaks nothing.
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
    const envelope: ErrorEnvelope = {
      error: {
        code: "INTERNAL_ERROR",
        message: options.isProduction
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : String(err),
        ...(requestId !== undefined ? { requestId } : {}),
      },
    };
    res.status(500).json(envelope);
  };
}
