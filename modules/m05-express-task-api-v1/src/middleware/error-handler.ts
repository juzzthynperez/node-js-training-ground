// The central error handler — the ONE place every error ends up.
// Express recognizes error middleware by its 4-argument signature; in Express 5,
// rejected promises from async handlers land here automatically (no try/catch).
// Wire shape is the fixed envelope from brief.md.

import type { ErrorRequestHandler, Request, Response } from "express";
import { AppError, type ErrorEnvelope } from "../errors.ts";

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
