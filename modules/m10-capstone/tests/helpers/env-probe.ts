// Test-only probe for the fail-fast config contract (plan step: config.ts
// validates env at startup, fail fast). loadConfig() calls process.exit(1) on
// invalid env, which must NOT kill Jest — so the assertion runs this script
// in a CHILD process and checks the exit code and stderr instead. The probe
// inherits whatever env the test passes in; nothing else is set here.

import { loadConfig } from "../../src/config.ts";

const config = loadConfig();
// Valid env reaches here — print the parsed surface so a success run is
// observable, not just silent.
console.log(
  JSON.stringify({
    port: config.port,
    isProduction: config.isProduction,
    hasJwtSecret: config.jwtSecret.length >= 32,
    bcryptRounds: config.bcryptRounds,
    rateLimitMax: config.rateLimitMax,
  }),
);
