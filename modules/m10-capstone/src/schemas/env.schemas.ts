// src/schemas/env.schemas.ts — the ENVIRONMENT contract for the capstone,
// validated once at startup by src/config.ts (fail fast: a bad PORT or a
// missing JWT_SECRET must crash the process BEFORE the socket opens, not
// surface at the first request — M08's pattern, extended with the auth
// credentials the capstone introduces).
//
// The output of this schema IS AppConfig (z.output below) — the type cannot
// drift from the validation because it is derived from it.

import { z } from "zod";

const PORT_MESSAGE = "PORT must be an integer between 1 and 65535";
const NODE_ENV_MESSAGE = "NODE_ENV must be one of: development, production, test";
const JWT_SECRET_MESSAGE =
  "JWT_SECRET must be at least 32 characters — set it in .env, never hard-code or commit it";
const JWT_EXPIRES_IN_MESSAGE = "JWT_EXPIRES_IN must be a non-empty token lifetime (e.g. 1h, 7d)";
const BCRYPT_ROUNDS_MESSAGE = "BCRYPT_ROUNDS must be an integer between 4 and 15";
const RATE_LIMIT_MAX_MESSAGE = "RATE_LIMIT_MAX must be an integer of 1 or more";
const RATE_LIMIT_WINDOW_MS_MESSAGE = "RATE_LIMIT_WINDOW_MS must be an integer of 1 or more";

export const envSchema = z
  .object({
    PORT: z.coerce.number({ error: PORT_MESSAGE })
      .int({ error: PORT_MESSAGE })
      .min(1, { error: PORT_MESSAGE })
      .max(65535, { error: PORT_MESSAGE })
      .default(3000),
    NODE_ENV: z.enum(["development", "production", "test"], { error: NODE_ENV_MESSAGE }).optional(),
    // The signing secret is a REQUIRED credential: no length floor, no default,
    // no hard-coded fallback — a token signed with an absent secret would be
    // forgeable. The 32-character floor rejects trivially guessable values
    // while the placeholder in .env.example still satisfies it.
    JWT_SECRET: z.string({ error: JWT_SECRET_MESSAGE }).min(32, { error: JWT_SECRET_MESSAGE }),
    JWT_EXPIRES_IN: z.string({ error: JWT_EXPIRES_IN_MESSAGE }).min(1, { error: JWT_EXPIRES_IN_MESSAGE })
      .default("1h"),
    BCRYPT_ROUNDS: z.coerce.number({ error: BCRYPT_ROUNDS_MESSAGE })
      .int({ error: BCRYPT_ROUNDS_MESSAGE })
      .min(4, { error: BCRYPT_ROUNDS_MESSAGE })
      .max(15, { error: BCRYPT_ROUNDS_MESSAGE })
      .default(10),
    RATE_LIMIT_MAX: z.coerce.number({ error: RATE_LIMIT_MAX_MESSAGE })
      .int({ error: RATE_LIMIT_MAX_MESSAGE })
      .min(1, { error: RATE_LIMIT_MAX_MESSAGE })
      .default(10),
    RATE_LIMIT_WINDOW_MS: z.coerce.number({ error: RATE_LIMIT_WINDOW_MS_MESSAGE })
      .int({ error: RATE_LIMIT_WINDOW_MS_MESSAGE })
      .min(1, { error: RATE_LIMIT_WINDOW_MS_MESSAGE })
      .default(60000),
  })
  .transform((env) => ({
    port: env.PORT,
    isProduction: env.NODE_ENV === "production",
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  }));

/** Derived, never hand-written: rename a transform output and tsc points at
 *  every consumer of AppConfig instead of letting the two drift silently. */
export type AppConfig = z.output<typeof envSchema>;
