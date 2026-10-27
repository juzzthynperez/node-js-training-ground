// M05/M08 — the frozen program-wide error envelope, implemented here as types
// + the AppError hierarchy. The wire shape (`{ error: { code, message,
// details?, requestId? } }`) comes from brief.md's contract; the hierarchy is
// ours. The code SET is ours too (the brief lets us choose it): the four M05
// codes plus UNAUTHORIZED/FORBIDDEN/RATE_LIMITED, because the capstone's
// security rubric needs 401/403/429 answers and a "consistent error shape"
// means THOSE go through the same envelope as everything else.

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Stable, machine-readable code per error type. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
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
 * (bad input, missing resource, conflict, wrong role). The central error
 * handler turns an AppError into the envelope; anything that is NOT an
 * AppError is treated as a programmer error and becomes a 500 with no
 * internals leaked.
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

/** No/invalid Bearer token — the credential itself is missing or unverifiable. */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required: missing or invalid token") {
    super(401, "UNAUTHORIZED", message);
  }
}

/** Valid identity, wrong role — the authorization BOUNDARY, not a login problem. */
export class ForbiddenError extends AppError {
  constructor(message = "Your role is not allowed to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

/** Rate limiter tripped on an auth endpoint (scoped by config, never global). */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests, try again later") {
    super(429, "RATE_LIMITED", message);
  }
}
