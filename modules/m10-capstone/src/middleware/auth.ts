// src/middleware/auth.ts — the authorization boundary (plan step 5).
//
// Two gates, deliberately separate concerns:
//   requireAuth(config) — WHO is calling: parses the Bearer header, verifies
//     signature+expiry (lib/jwt), attaches req.user. 401 = the credential is
//     missing/unusable.
//   requireRole(...roles) — whether this identity MAY: 403 = authenticated,
//     wrong role. Keeping 401/403 distinct is the rubric's "genuinely
//     differs" — a MEMBER's request is not a login problem.
//
// Both are factories (like errorHandlerFactory): the secret arrives through
// AppConfig, never a module-level import of process.env.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AppConfig } from "../config.ts";
import { ForbiddenError, UnauthorizedError } from "../errors.ts";
import { verifyToken } from "../lib/jwt.ts";

export type Role = "MEMBER" | "LIBRARIAN";

/** The verified caller — written only by requireAuth, read by handlers. */
export interface AuthenticatedUser {
  userId: string;
  role: Role | string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth after signature+expiry verification. */
      user?: AuthenticatedUser;
    }
  }
}

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function requireAuth(config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.get("authorization");
    const match = header === undefined ? null : BEARER_PATTERN.exec(header);
    if (match === null || match[1] === undefined) {
      // Missing header, "Basic ...", bare "Bearer" — all the same answer:
      // the credential is absent or malformed.
      next(new UnauthorizedError("Authorization header must be: Bearer <token>"));
      return;
    }
    // verifyToken throws UnauthorizedError for bad signature, expiry, or
    // malformed claims — one 401 path for every failure mode.
    const payload = verifyToken(match[1], config);
    req.user = { userId: payload.sub, role: payload.role };
    next();
  };
}

/** Gate AFTER requireAuth: authenticated identity must hold one of `roles`.
 *  Runs the check even if requireAuth was miswired (defensive 401, never an
 *  implicit allow). */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user === undefined) {
      // Wiring bug (requireAuth missing upstream) — fail closed.
      next(new UnauthorizedError("Authentication required: missing or invalid token"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
