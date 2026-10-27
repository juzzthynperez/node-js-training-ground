// The app factory for integration tests (M09 step 5, carried into M10).
//
// buildApp (app.ts) never calls listen — that separation was M05's design and
// it is precisely what lets these tests run the FULL middleware chain without
// opening a port. request(app) drives it in-process instead.

import type { Express } from "express";
import { buildApp } from "../../src/app.ts";
import { loadConfig } from "../../src/config.ts";

/** Fresh app per call. loadConfig() reads this worker's env (forced by
 *  tests/setup-env.mjs): NODE_ENV=test → isProduction=false, so error
 *  responses are the development rendering — which is exactly what the
 *  "never leaks a stack trace" test has to hold the line on. */
export function makeTestApp(): Express {
  return buildApp(loadConfig());
}
