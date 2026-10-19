// Async Toolkit — M04 deliverable (TypeScript port of the M02 JavaScript toolkit)
// One ES module, strict TypeScript, node:assert self-checks (no test framework yet).
//
// Run the self-checks:  npm run toolkit        (via tsx)
//                       npm run toolkit:native (Node's native type stripping)
// Type-check:           npm run typecheck      (tsc --noEmit, zero errors required)
// Import the utilities: import { sleep, retry, withTimeout, mapLimit } from './async-toolkit.ts';

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by withTimeout when a promise does not settle within the time limit. */
export class TimeoutError extends Error {
  readonly ms: number;

  constructor(ms: number, options?: ErrorOptions) {
    super(`Promise did not settle within ${ms}ms`, options);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Resolve after `ms` milliseconds.
 * A Promise wrapper around setTimeout — the smallest possible async utility.
 * `ms` must be a finite number in [0, 2**31 - 1] — setTimeout silently clamps
 * larger values to ~1ms, so the range is enforced, not assumed.
 * Declared async so a bad `ms` arrives as a rejection, like retry/mapLimit,
 * instead of a surprise synchronous throw.
 */
export async function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms < 0 || ms > 2 ** 31 - 1) {
    // setTimeout clamps Infinity and values > 2**31-1 down to ~1ms with only a
    // warning — "sleep forever" would resolve almost instantly. Reject instead.
    throw new RangeError(
      `sleep(ms): ms must be a finite number between 0 and 2**31 - 1, got ${ms}`,
    );
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Call `fn` until it succeeds, up to `retries` extra attempts after the first.
 * `fn` receives the attempt number (1-based) so it can log what it is doing.
 * The generic `T` is whatever `fn` resolves to — the success type passes
 * straight through `retry`, so callers never re-declare it.
 * Waits `delayMs` between attempts; `delayMs` must be a finite number in
 * [0, 2**31 - 1] (same setTimeout clamp limit as sleep).
 * Rethrows the last error — never swallows it.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  { retries = 3, delayMs = 100 }: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retry: retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2 ** 31 - 1) {
    // same clamp trap as sleep(ms): setTimeout would fire almost immediately
    throw new RangeError(
      `retry: delayMs must be a finite number between 0 and 2**31 - 1, got ${delayMs}`,
    );
  }

  const totalAttempts = retries + 1;
  // Seeded with undefined so the definite-assignment check is satisfied without
  // an assertion: the loop always runs at least once (retries >= 0), so a real
  // error is always captured before the throw. `unknown`, never `any`.
  let lastError: unknown = undefined;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < totalAttempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

/**
 * Race `promise` against a timeout. Resolves with the promise's value if it
 * settles in time; otherwise rejects with a TimeoutError whose `cause` is the
 * abort reason from AbortSignal.timeout(ms).
 *
 * The timeout is cancellation-shaped: AbortSignal.timeout is the modern Node
 * way to say "give up after this long" (see AbortController for cancelling
 * work you started, covered in the timing script and training material).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const signal = AbortSignal.timeout(ms); // throws RangeError for invalid ms
  const timeout = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new TimeoutError(ms, { cause: signal.reason }));
      return;
    }
    signal.addEventListener(
      'abort',
      () => reject(new TimeoutError(ms, { cause: signal.reason })),
      { once: true },
    );
  });
  // Promise.race subscribes to both branches, so neither rejection can become
  // an unhandled rejection — losing the race does not mean being ignored.
  return Promise.race([promise, timeout]);
}

/**
 * Map over `items` with at most `limit` concurrent calls of `async fn`.
 * Results come back in input order. Rejects as soon as any call rejects.
 *
 * The M02 version pulled items by index (`items[index]`); under
 * `noUncheckedIndexedAccess` that read is `T | undefined`, and the
 * `index < items.length` loop condition cannot prove otherwise. Workers pull
 * from a shared iterator instead — `IteratorResult` narrows to a real `T`
 * once `done` is false, so the in-bounds guarantee is expressed in the type
 * rather than assumed past the compiler.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapLimit: limit must be an integer >= 1, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  const iterator = items[Symbol.iterator]();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const step = iterator.next();
      if (step.done) {
        return;
      }
      // No await between the pull and the counter: workers claim consecutive
      // indexes in exactly the order they took the items, so input order
      // survives the shuffling.
      const index = nextIndex++;
      results[index] = await fn(step.value, index);
    }
  }

  // A fixed pool of workers sharing one iterator: at most `limit` calls
  // are in flight at any moment.
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Self-checks (node:assert — no test framework yet, that is M09)
// ---------------------------------------------------------------------------

interface CheckOutcome {
  name: string;
  ok: boolean;
}

function makeHarness() {
  const results: CheckOutcome[] = [];
  return {
    async check(name: string, fn: () => Promise<void>): Promise<void> {
      try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  ok - ${name}`);
      } catch (error) {
        results.push({ name, ok: false });
        console.log(`  FAIL - ${name}`);
        // catch gives us `unknown` under strict — narrow before reading `.message`.
        console.log(`         ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    summary(): boolean {
      const failed = results.filter((r) => !r.ok).length;
      const passed = results.length - failed;
      console.log(`\n${passed}/${results.length} self-checks passed`);
      if (failed > 0) process.exitCode = 1;
      return failed === 0;
    },
  };
}

export async function runSelfChecks(): Promise<boolean> {
  const t = makeHarness();

  console.log('sleep');
  await t.check('resolves after the requested delay', async () => {
    const started = Date.now();
    const value = await sleep(50);
    const elapsed = Date.now() - started;
    assert.equal(value, undefined);
    assert.ok(elapsed >= 50, `expected >= 50ms, waited ${elapsed}ms`);
  });
  await t.check('rejects negative, non-finite, or out-of-range delays', async () => {
    await assert.rejects(sleep(-1), RangeError);
    await assert.rejects(sleep(Infinity), RangeError);
    await assert.rejects(sleep(2 ** 31), RangeError);
  });

  console.log('retry');
  await t.check('returns the value once fn succeeds', async () => {
    let attempts = 0;
    const value = await retry(
      async (attempt) => {
        attempts = attempt;
        if (attempt < 3) throw new Error('not yet');
        return 'done';
      },
      { retries: 3, delayMs: 10 },
    );
    assert.equal(value, 'done');
    assert.equal(attempts, 3, 'expected exactly 3 attempts');
  });
  await t.check('rethrows the last error when attempts run out', async () => {
    let attempts = 0;
    await assert.rejects(
      retry(
        async () => {
          attempts++;
          throw new Error(`attempt ${attempts} failed`);
        },
        { retries: 2, delayMs: 10 },
      ),
      /attempt 3 failed/,
    );
    assert.equal(attempts, 3, 'expected first try + 2 retries');
  });
  await t.check('waits delayMs between attempts', async () => {
    const started = Date.now();
    await assert.rejects(
      retry(async () => {
        throw new Error('always fails');
      }, { retries: 2, delayMs: 50 }),
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 100, `expected >= 100ms of delays, took ${elapsed}ms`);
  });
  await t.check('rejects invalid options instead of hiding them', async () => {
    await assert.rejects(retry(async () => {}, { retries: -1 }), RangeError);
    await assert.rejects(retry(async () => {}, { delayMs: -5 }), RangeError);
    await assert.rejects(retry(async () => {}, { delayMs: Infinity }), RangeError);
  });

  console.log('withTimeout');
  await t.check('passes through a value that settles in time', async () => {
    const value = await withTimeout(sleep(10).then(() => 'ok'), 500);
    assert.equal(value, 'ok');
  });
  await t.check('rejects with TimeoutError when the promise is too slow', async () => {
    const started = Date.now();
    await assert.rejects(withTimeout(sleep(400), 40), (error) => {
      // The validator's parameter is `unknown` — narrow before reading members.
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'TimeoutError');
      assert.ok(error.cause, 'expected the abort reason as error.cause');
      assert.match(error.message, /40ms/);
      return true;
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 250, `timed out late: took ${elapsed}ms`);
  });
  await t.check('propagates the real rejection, not a timeout', async () => {
    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 500), /boom/);
  });

  console.log('mapLimit');
  await t.check('maps every item, preserving input order', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = await mapLimit(items, 3, async (n) => {
      await sleep(10);
      return n * 2;
    });
    assert.deepEqual(results, items.map((n) => n * 2));
  });
  await t.check('never runs more than `limit` calls at once', async () => {
    let active = 0;
    let maxActive = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(15);
      active--;
    });
    assert.ok(maxActive <= 3, `saw ${maxActive} concurrent calls, limit is 3`);
    assert.equal(maxActive, 3, 'expected the limit to actually be reached');
  });
  await t.check('runs sequentially when limit is 1', async () => {
    let active = 0;
    let maxActive = 0;
    await mapLimit([1, 2, 3], 1, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
      return n;
    });
    assert.equal(maxActive, 1);
  });
  await t.check('handles an empty list', async () => {
    const results = await mapLimit([], 4, async (n) => n);
    assert.deepEqual(results, []);
  });
  await t.check('rejects when any call rejects', async () => {
    await assert.rejects(
      mapLimit([1, 2, 3, 4], 2, async (n) => {
        if (n === 3) throw new Error('item 3 exploded');
        await sleep(5);
        return n;
      }),
      /item 3 exploded/,
    );
  });
  await t.check('fails fast instead of waiting for stragglers', async () => {
    // item 4 is a long-running straggler; an allSettled-style implementation
    // would only reject after it finishes (~400ms). Fail-fast must reject
    // almost immediately after item 3 explodes.
    const started = Date.now();
    await assert.rejects(
      mapLimit([1, 2, 3, 4], 2, async (n) => {
        if (n === 3) throw new Error('item 3 exploded');
        await sleep(n === 4 ? 400 : 5);
        return n;
      }),
      /item 3 exploded/,
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 200, `waited ${elapsed}ms for stragglers — not fail-fast`);
  });
  await t.check('rejects an invalid limit', async () => {
    await assert.rejects(mapLimit([1], 0, async (n) => n), RangeError);
    await assert.rejects(mapLimit([1], 1.5, async (n) => n), RangeError);
  });

  return t.summary();
}

// Self-checks run only when this file is the entry point
// (`tsx async-toolkit.ts` / `node async-toolkit.ts`), so importing the toolkit
// has no side effects.
const entryPath = process.argv[1];
const entry = entryPath ? path.resolve(entryPath) : null;
const isEntryPoint =
  import.meta.main ?? (entry !== null && fileURLToPath(import.meta.url) === entry);
if (isEntryPoint) {
  await runSelfChecks();
}
