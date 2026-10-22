# M08/M09 — Zod Validation & Integration Testing (Task API v3 → v4)

[![CI](https://github.com/juzzthynperez/node-js-training-ground/actions/workflows/ci.yml/badge.svg)](https://github.com/juzzthynperez/node-js-training-ground/actions/workflows/ci.yml)

Express 5 + TypeScript 7 (ESM) + Prisma 7 + Zod 4 Task API. M08 built the
v3 validation layer; **M09 evolved this same directory into Task API v4** —
25+ Jest 30 / Supertest 7 integration tests against the real exported app and
a dedicated SQLite `test.db`, plus the test-first `PATCH /tasks/:id/complete`
endpoint. (In-place reuse instead of a copied module folder was an
owner-directed revision — v3's exact state remains on the branch
`feat/m08-zod-task-api-v3`.)

## Scripts

| script | what it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` — the type-safety gate (Jest runs on @swc/jest, which strips types) |
| `npm test` | integration suite: ESM mode, `--runInBand` (SQLite single writer) |
| `npm run test:random` | same suite with `--randomize` — exposes order-dependent tests |
| `npm run test:coverage` | coverage with 80% thresholds on `src/routes/**` and `src/services/**` |
| `npm run dev` | `tsx src/server.ts` |
| `npm run test:bruno` | the frozen Bruno contract suite (m05–m08 wire behaviour) |
| `npm run db:deploy` / `db:seed` | replay recorded migrations / rebuild seed data |
