// config.ts — environment validated ONCE at startup with a Zod schema,
// failing fast (M08 pattern): an invalid PORT or a missing JWT_SECRET crashes
// the process with a readable error BEFORE the socket opens, instead of
// surfacing at the first request. AppConfig is DERIVED from the schema
// (z.output) — type and validation cannot drift apart.

import { z } from "zod";
import { envSchema, type AppConfig } from "./schemas/env.schemas.ts";

// The envelope type stays exported under its old name: app.ts and server.ts
// consume AppConfig without caring that it is inferred, not written.
export type { AppConfig } from "./schemas/env.schemas.ts";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Fail fast, before listen(): the prettified tree names each bad variable
    // and its path — the debug surface Zod gives you over a thrown Error.
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}
