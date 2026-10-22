// src/schemas/env.schemas.ts — the ENVIRONMENT contract, validated once at
// startup by src/config.ts (fail fast: a bad PORT must crash the process
// before the socket ever opens, not surface at the first request).
//
// The output of this schema IS AppConfig (z.output below) — the type cannot
// drift from the validation because it is derived from it.

import { z } from "zod";

const PORT_MESSAGE = "PORT must be an integer between 1 and 65535";
const NODE_ENV_MESSAGE = "NODE_ENV must be one of: development, production, test";

export const envSchema = z
  .object({
    PORT: z.coerce.number({ error: PORT_MESSAGE })
      .int({ error: PORT_MESSAGE })
      .min(1, { error: PORT_MESSAGE })
      .max(65535, { error: PORT_MESSAGE })
      .default(3000),
    NODE_ENV: z.enum(["development", "production", "test"], { error: NODE_ENV_MESSAGE }).optional(),
  })
  .transform((env) => ({
    port: env.PORT,
    isProduction: env.NODE_ENV === "production",
  }));

/** Derived, never hand-written: rename a transform output and tsc points at
 *  every consumer of AppConfig instead of letting the two drift silently. */
export type AppConfig = z.output<typeof envSchema>;
