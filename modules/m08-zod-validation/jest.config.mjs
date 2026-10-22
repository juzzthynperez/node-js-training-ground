// Jest 30 config — M09. ESM mode (@swc/jest strips types; tsc --noEmit is the
// separate type-safety gate — running Jest through tsc would fuse two jobs
// the brief keeps apart). The config is .mjs so Jest loads it WITHOUT needing
// a transform for the file that configures the transform.
//
// Run scripts use the cross-platform form (no Unix env-var prefix):
//   node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  // src/*.ts and the Prisma-generated client use explicit .ts import
  // specifiers (allowImportingTsExtensions) — @swc/jest strips the types and
  // Jest's resolver matches the literal file.
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["@swc/jest", { jsc: { parser: { syntax: "typescript" } } }],
  },
  // Order is load-bearing: globalSetup builds test.db ONCE in the main
  // process → setup-env points the worker at test.db before any test module
  // imports src/db.ts (setupFiles re-run per test file — kept idempotent) →
  // setup-framework registers the per-suite disconnect.
  globalSetup: "<rootDir>/tests/global-setup.mjs",
  setupFiles: ["<rootDir>/tests/setup-env.mjs"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup-framework.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  // Coverage scope is the brief's acceptance target: routes and services.
  // The generated client is third-party output — instrumenting it would sink
  // the percentage without proving anything about OUR code.
  collectCoverageFrom: [
    "src/routes/**/*.ts",
    "src/services/**/*.ts",
    "!src/generated/**",
  ],
  coverageThreshold: {
    "src/routes/**": { statements: 80, branches: 80, functions: 80, lines: 80 },
    "src/services/**": { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
