// src/schemas/auth.schemas.ts — the request contract for registration and
// login. Zod owns the types (z.infer aliases are the only input types).
//
// Security notes that live HERE rather than in the handler:
//   * `role` is ABSENT from the register schema. Self-registration can only
//     ever produce a MEMBER — the role field is unreachable from the wire,
//     so no mass-assignment can mint a LIBRARIAN. Librarian accounts are
//     provisioned by the seed (the trust boundary is the database, not a
//     hidden form field).
//   * Password length floors are enforced at registration only; login accepts
//     any non-empty password so the FAILURE answer for a short password is
//     the same 401 as any other wrong password (no policy oracle).
//   * bcrypt hashes at most 72 BYTES — capping password at 72 characters
//     documents the limit where the algorithm starts silently truncating.

import { z } from "zod";

const NAME_MESSAGE = "name must be a non-empty string";
const EMAIL_MESSAGE = "email must be a valid email address";
const PASSWORD_MIN = "password must be at least 8 characters";
const PASSWORD_MAX = "password must be at most 72 characters (bcrypt's block size)";

export const registerSchema = z.object({
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, { error: NAME_MESSAGE }).max(100, {
    error: "name must be at most 100 characters",
  }),
  email: z.email({ error: EMAIL_MESSAGE }).max(254, { error: EMAIL_MESSAGE }),
  password: z
    .string({ error: PASSWORD_MIN })
    .min(8, { error: PASSWORD_MIN })
    .max(72, { error: PASSWORD_MAX }),
});

export const loginSchema = z.object({
  email: z.email({ error: EMAIL_MESSAGE }).max(254, { error: EMAIL_MESSAGE }),
  // min 1, NOT min 8: see header. A wrong-password answer must not depend on
  // how the password fails, or the 400-vs-401 split leaks the policy.
  password: z.string({ error: "password is required" }).min(1, { error: "password is required" }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** The public user shape every auth response carries — `passwordHash` can
 *  never appear in it because it is constructed field-by-field, not spread. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}
