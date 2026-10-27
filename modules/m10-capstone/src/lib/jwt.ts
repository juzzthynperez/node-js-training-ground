// src/lib/jwt.ts — token signing/verification for the capstone (JWT chosen in
// the research phase; rationale in the write-up: stateless, header-assertable
// in Supertest, no CSRF surface).
//
// The signing secret NEVER appears here as a literal — it arrives through
// AppConfig, which validated it at startup (fail fast, never committed).

import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../errors.ts";
import type { AppConfig } from "../config.ts";

/** The claims our API issues. `sub` = user id (JWT convention), `role` = the
 *  authorization input the role gate reads. No PII beyond the role. */
export interface TokenPayload {
  sub: string;
  role: string;
}

interface DecodedJwtPayload {
  sub?: unknown;
  role?: unknown;
}

export function signToken(payload: TokenPayload, config: AppConfig): string {
  return jwt.sign(payload, config.jwtSecret, {
    // Boundary cast: config validates JWT_EXPIRES_IN as a non-empty string,
    // while @types/jsonwebtoken narrows the option to ms's template-literal
    // type ("1h", "7d", …). Zod cannot express ms's grammar precisely enough
    // to make the widening vanish, so the ONE cast lives at the sign call —
    // a malformed lifetime still fails loudly here (jsonwebtoken rejects it),
    // not silently in a handler.
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/** Verify signature + expiry, then narrow the claims we depend on.
 *  Every failure mode — bad signature, expired, malformed claims — is the
 *  same client answer: 401 through the shared envelope. */
export function verifyToken(token: string, config: AppConfig): TokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  if (typeof decoded === "string") {
    throw new UnauthorizedError("Invalid or expired token");
  }
  const claims = decoded as DecodedJwtPayload;
  if (typeof claims.sub !== "string" || typeof claims.role !== "string") {
    // Signed by us but shaped wrong (issued by an older/foreign config) —
    // treat exactly like an unverifiable token, never trust the payload.
    throw new UnauthorizedError("Invalid or expired token");
  }
  return { sub: claims.sub, role: claims.role };
}
