// src/middleware/validate.ts — the typed validate() middleware (Task API v3).
//
// validate({ body, params, query }) safe-parses ONLY the parts a route names
// and stores the PARSED values on req.valid. Two reasons this file exists:
//
// 1. req.query is read-only in Express 5 (it is a getter — assignment
//    throws), so the validated query cannot be written back. req.valid is
//    our typed home for parsed parts instead.
// 2. req.body is untrusted data. Handlers must never read it raw; they read
//    the parsed copy through getValid(), whose type comes from the schema.
//
// On failure the raw ZodError is forwarded with next() — never swallowed,
// never re-wrapped: the central error handler is the one place every error
// ends up (arch doc layer rule), and it maps ZodError -> 400 + details[].

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";

/** Which parts of the request a route wants validated. Omit a part and it is
 *  neither validated nor stored (DELETE only needs params, POST / only body). */
export interface ValidationSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

export type ValidatablePart = "body" | "params" | "query";

declare global {
  namespace Express {
    interface Request {
      /** Parsed, validated request parts — written by the validate()
       *  middleware. Always read it through getValid(), never raw. */
      valid?: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const valid: NonNullable<Request["valid"]> = {};

    for (const part of ["body", "params", "query"] as const) {
      const schema = schemas[part];
      if (schema === undefined) continue;

      const result = schema.safeParse(req[part] as unknown);
      if (!result.success) {
        next(result.error); // ZodError -> central handler -> fixed 400 envelope
        return;
      }
      valid[part] = result.data;
    }

    req.valid = valid;
    next();
  };
}

/** Typed read of an already-validated part. The ONE boundary cast lives here,
 *  justified by the runtime guarantee that validate() just parsed this part
 *  against the very schema you pass: the schema argument IS the type
 *  (z.infer/z.output) — handlers declare no input interfaces at all.
 *  validate() missing on the route is a wiring bug, so it fails loud (500),
 *  never silently as `undefined` reaching business logic. */
export function getValid<S extends z.ZodType>(
  req: Request,
  part: ValidatablePart,
  schema: S,
): z.output<S> {
  if (req.valid === undefined || !(part in req.valid)) {
    throw new Error(`validate({ ${part} }) middleware must run before this handler`);
  }
  return req.valid[part] as z.output<S>;
}
