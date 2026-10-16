# Node.js Training Ground

Shared practical repository for the Node.js Developer Training program. Each module's exercises, experiments, and examples live here as runnable, committed work.

**What belongs here:** module code and practice, organized per module (e.g., M01 `hello-node`).
**What does not:** trainer-private evidence — this repo carries only the exercises themselves; their branch/PR history is the public checkpoint trail.

## Repository layout convention (M01–M10)

Every module's practical exercises and supporting files live under a per-module folder:

```
modules/
├── m01-dev-environment-git-github/
├── m02-modern-javascript-async-await/
├── m03-nodejs-runtime-npm/
├── m04-typescript-on-node/
├── m05-express-task-api-v1/
├── m06-sql-fundamentals-sqlite/
├── m07-prisma-orm-migrations/
├── m08-zod-validation/
├── m09-integration-testing/
└── m10-capstone/
```

- Folder names match the module folders in `node-js-training-rnd` one-to-one.
- Folders appear here as each module starts — an absent folder simply means that module hasn't begun.
- The repository root holds repo-wide configuration only: `README.md`, `.gitignore`, and `.nvmrc` (the Node version pin applies to the whole ground, not one module).
- `evidence/` is trainer-private: gitignored, untracked, and never committed — module history in this repo is the public checkpoint trail on its own.

Companion documentation repo: `node-js-training-rnd` (trainer write-ups and learner training material).
