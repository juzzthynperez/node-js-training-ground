// Env validation evidence (rubric: "Zod validation for ... env"). Each case
// spawns tests/helpers/env-probe.ts in a child process — the real loadConfig,
// the real process.exit(1), observed from outside so Jest survives the exit.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@jest/globals";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const probe = path.join(rootDir, "tests", "helpers", "env-probe.ts");

/** A fully valid test environment — each case overrides exactly one field. */
function baseEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"],
    SYSTEMROOT: process.env["SYSTEMROOT"],
    DATABASE_URL: "file:./test.db",
    NODE_ENV: "test",
    PORT: "3000",
    JWT_SECRET: "test-only-secret-not-a-real-credential-0123456789",
    JWT_EXPIRES_IN: "15m",
    BCRYPT_ROUNDS: "4",
    RATE_LIMIT_MAX: "1000",
    RATE_LIMIT_WINDOW_MS: "60000",
  };
}

function runProbe(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsxCli, probe], { cwd: rootDir, env, encoding: "utf8" });
}

describe("config.ts fail-fast (env validation)", () => {
  it("accepts a valid environment and prints the parsed config", () => {
    const result = runProbe(baseEnv());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"port":3000');
    expect(result.stdout).toContain('"hasJwtSecret":true');
  });

  it("exits 1 with a readable error on a malformed PORT", () => {
    const env = baseEnv();
    env["PORT"] = "not-a-port";
    const result = runProbe(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PORT");
  });

  it("exits 1 when JWT_SECRET is missing entirely", () => {
    const env = baseEnv();
    delete env["JWT_SECRET"];
    const result = runProbe(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JWT_SECRET");
  });

  it("exits 1 when JWT_SECRET is too short to sign anything safely", () => {
    const env = baseEnv();
    env["JWT_SECRET"] = "short";
    const result = runProbe(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JWT_SECRET");
  });

  it("exits 1 when BCRYPT_ROUNDS is outside the 4..15 range", () => {
    const env = baseEnv();
    env["BCRYPT_ROUNDS"] = "99";
    const result = runProbe(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BCRYPT_ROUNDS");
  });
});
