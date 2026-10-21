// M05 — the fixed program-wide error envelope, implemented here as types + the
// AppError hierarchy. The wire shape comes from brief.md; the hierarchy is ours.

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Stable, machine-readable code per error type (the brief lets us choose the set). */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

/** The exact JSON every error response produces. `details` is present only on
 *  validation errors (see error-handler.ts — it is omitted when empty). */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId?: string;
  };
}

/**
 * Base class for operational errors — things that can happen in normal running
 * (bad input, missing resource, conflict). The central error handler turns an
 * AppError into the envelope; anything that is NOT an AppError is treated as a
 * programmer error and becomes a 500 with no internals leaked.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];

  constructor(status: number, code: ErrorCode, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Request validation failed", details: ErrorDetail[] = []) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(409, "CONFLICT", message);
  }
}
