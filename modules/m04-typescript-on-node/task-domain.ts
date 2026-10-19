// Task domain types — M04 deliverable (types + guards; no framework yet).
// Deriving input types from the domain type with utility types, not by hand.
//
// Run the self-checks:  npx tsx task-domain.ts
// Type-check:           npm run typecheck

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A literal union — no enum: unions stay erasable, value-level, and refactoring-friendly. */
export type TaskStatus = 'pending' | 'in_progress' | 'done';

/**
 * The domain type. An `interface` here (extensible object shape, supports
 * declaration merging); the derivations below need `type` (unions, mapped
 * types) — that split is the `type` vs `interface` teaching point.
 * `id`/`createdAt`/`updatedAt` are `readonly`: the system, not the caller,
 * owns them.
 */
export interface Task {
  readonly id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What a caller may supply when creating a task: everything the system does
 * not assign. Derived with Omit — hand-writing it would let the two drift
 * apart the moment `Task` gains a field.
 */
export type CreateTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * A patch: every create field, optional. Partial<Omit<...>> layers two utility
 * types — Partial makes properties optional, Omit strips the system-owned ones.
 * An empty patch is valid (a no-op update).
 */
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

// ---------------------------------------------------------------------------
// Result<T, E> — a discriminated union on the literal field `ok`
// ---------------------------------------------------------------------------

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Type guard: narrows a `Result` to its success branch. */
export function isOk<T, E>(
  result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}

/** Type guard: narrows a `Result` to its failure branch. */
export function isErr<T, E>(
  result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } {
  return !result.ok;
}

// ---------------------------------------------------------------------------
// Self-checks — runtime proof that the guards discriminate; the compile-time
// proof (narrowing, derived input types) is `npm run typecheck` itself.
// ---------------------------------------------------------------------------

export function runDomainSelfChecks(): boolean {
  let failed = 0;
  const check = (name: string, fn: () => void): void => {
    try {
      fn();
      console.log(`  ok - ${name}`);
    } catch (error) {
      failed++;
      console.log(`  FAIL - ${name}`);
      console.log(`         ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  check('ok/err produce the expected shape', () => {
    assert.deepEqual(ok(42), { ok: true, value: 42 });
    assert.deepEqual(err('boom'), { ok: false, error: 'boom' });
  });

  check('switching on .ok narrows both branches at runtime', () => {
    const outcomes: Result<number, string>[] = [ok(42), err('boom')];
    const seen: string[] = [];
    for (const outcome of outcomes) {
      switch (outcome.ok) {
        case true:
          // Inside this arm the compiler knows `outcome.value` is number.
          seen.push(`value:${outcome.value.toFixed(0)}`);
          break;
        case false:
          // And here `outcome.error` is string — `.toUpperCase()` type-checks.
          seen.push(`error:${outcome.error.toUpperCase()}`);
          break;
      }
    }
    assert.deepEqual(seen, ['value:42', 'error:BOOM']);
  });

  check('isOk/isErr guards agree with .ok', () => {
    const good: Result<string, Error> = ok('yes');
    const bad: Result<string, Error> = err(new Error('no'));
    assert.ok(isOk(good) && !isErr(good));
    assert.ok(isErr(bad) && !isOk(bad));
  });

  check('CreateTaskInput accepts create fields only (no id/timestamps)', () => {
    const input: CreateTaskInput = {
      title: 'Write the M04 port',
      status: 'pending',
    };
    assert.equal('id' in input, false);
    assert.equal('createdAt' in input, false);
    // `description` is optional — omitting it is valid (compile-time too).
    const complete: CreateTaskInput = {
      title: 'Write the M04 port',
      description: 'TypeScript, strictly',
      status: 'in_progress',
    };
    assert.equal(complete.description, 'TypeScript, strictly');
  });

  check('UpdateTaskInput accepts a partial patch, including empty', () => {
    const empty: UpdateTaskInput = {};
    const patch: UpdateTaskInput = { status: 'done' };
    assert.deepEqual(empty, {});
    assert.equal(patch.status, 'done');
    // readonly system fields are not patchable — uncomment to see tsc object:
    // const illegal: UpdateTaskInput = { id: 'x' };
  });

  const total = 5;
  console.log(`\n${total - failed}/${total} domain self-checks passed`);
  if (failed > 0) process.exitCode = 1;
  return failed === 0;
}

// Self-checks run only when this file is the entry point (`npx tsx task-domain.ts`).
const entryPath = process.argv[1];
const entry = entryPath ? path.resolve(entryPath) : null;
const isEntryPoint =
  import.meta.main ?? (entry !== null && fileURLToPath(import.meta.url) === entry);
if (isEntryPoint) {
  runDomainSelfChecks();
}
