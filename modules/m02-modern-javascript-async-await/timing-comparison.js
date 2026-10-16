// M02 lab step 3 — sequential vs parallel fetching from JSONPlaceholder.
//
// Run:  node timing-comparison.js
//
// Fetches the same set of posts twice: once one-after-another, once all at
// once with Promise.all, and prints the wall-clock time of each. The point is
// to measure, not to guess — the numbers in the M02 write-up come from here.

const POST_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const BASE_URL = 'https://jsonplaceholder.typicode.com/posts';

async function fetchPost(id) {
  const response = await fetch(`${BASE_URL}/${id}`);
  if (!response.ok) {
    throw new Error(`GET /posts/${id} -> HTTP ${response.status}`);
  }
  return response.json();
}

async function sequential(ids) {
  const posts = [];
  for (const id of ids) {
    posts.push(await fetchPost(id)); // one at a time: each waits for the last
  }
  return posts;
}

function parallel(ids) {
  // All requests are kicked off in the same tick; Promise.all waits for all.
  return Promise.all(ids.map((id) => fetchPost(id)));
}

async function measure(label, run) {
  const started = Date.now();
  const posts = await run();
  const elapsed = Date.now() - started;
  console.log(`${label.padEnd(12)} ${`${elapsed}ms`.padStart(8)}  (${posts.length} posts)`);
  return elapsed;
}

async function main() {
  // Warm-up: the first request pays DNS + TLS setup. One throwaway fetch
  // before the clock starts keeps that cost out of both measurements.
  await fetchPost(POST_IDS[0]);

  console.log(`Fetching ${POST_IDS.length} posts from JSONPlaceholder\n`);
  const sequentialMs = await measure('sequential', () => sequential(POST_IDS));
  const parallelMs = await measure('parallel', () => parallel(POST_IDS));

  console.log('');
  if (parallelMs < sequentialMs) {
    const saved = sequentialMs - parallelMs;
    const percent = Math.round((saved / sequentialMs) * 100);
    console.log(`parallel beat sequential by ${saved}ms (${percent}% faster)`);
  } else {
    console.log(
      'parallel did NOT beat sequential this run — network variance happens; run it again',
    );
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error('timing comparison failed:', error.message);
  console.error('check the network connection to jsonplaceholder.typicode.com');
  process.exitCode = 1;
}
