// M02 lab step 4 (after) — the same job refactored to promises + async/await.
//
// Run:  node async-after.js
//
// Identical input, identical transform, identical output to
// callback-before.js — but the flow reads top-to-bottom, one try/catch
// covers every step, and a rejection anywhere propagates instead of having
// to be spotted by a hand-written `if (err)` at each level.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demoDir = path.join(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'evidence',
  'm02',
  'fs-demo',
);
const inputPath = path.join(demoDir, 'notes.txt');
const outputPath = path.join(demoDir, 'notes-out.txt');

const NOTES = '  ship the toolkit  \n\nfix the flaky timing test\ntease apart the event loop\n  write the M02 write-up  \n';

function tidy(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n');
}

async function main() {
  await fs.mkdir(demoDir, { recursive: true });
  await fs.writeFile(inputPath, NOTES);
  const raw = await fs.readFile(inputPath, 'utf8');
  await fs.writeFile(outputPath, tidy(raw));
  const result = await fs.readFile(outputPath, 'utf8');
  console.log('async/await version finished. result:');
  console.log(result);
}

try {
  await main();
} catch (error) {
  // One catch for the whole flow — and the error still says what went wrong.
  console.error('refactored version failed:', error.message);
  process.exitCode = 1;
}
