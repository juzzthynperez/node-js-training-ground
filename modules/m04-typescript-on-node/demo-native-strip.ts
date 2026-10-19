// Native type-stripping demo — run this file BOTH ways and compare:
//   npx tsx demo-native-strip.ts        (the course's dev runner)
//   node demo-native-strip.ts           (Node 24 native type stripping)
// What Node 24 does with the second command is the awareness-level checkpoint —
// record the real output in your write-up, whatever it is.

import { sleep, retry, mapLimit, withTimeout, TimeoutError } from './async-toolkit.ts';

const attempt = await retry(async (n) => {
  await sleep(5);
  return n * 7;
}, { retries: 2, delayMs: 5 });
console.log('retry →', attempt);

const doubled = await mapLimit([1, 2, 3], 2, async (n) => n * 2);
console.log('mapLimit →', doubled);

try {
  await withTimeout(sleep(500), 25);
  console.log('withTimeout → unexpectedly resolved');
} catch (error) {
  // catch (e) is `unknown` under strict — narrow before touching members.
  if (error instanceof TimeoutError) {
    console.log('withTimeout →', error.name, `${error.ms}ms`);
  } else {
    throw error;
  }
}
console.log('demo ok');
