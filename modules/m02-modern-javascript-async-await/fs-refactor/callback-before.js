// M02 lab step 4 (before) — the same job in callback style.
//
// Run:  node callback-before.js
//
// Write a notes file, read it back, tidy it up, write the result — with
// node:fs callbacks. Notice how every step nests inside the previous step's
// callback, each needing its own `if (err)` check. The point of this file is
// to be the "before"; async-after.js does the same job flat.

import fs from 'node:fs';
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

// The callback pyramid: four steps, four levels of nesting, four error checks.
fs.mkdir(demoDir, { recursive: true }, (err) => {
  if (err) {
    console.error('could not create demo folder:', err.message);
    process.exitCode = 1;
    return;
  }
  fs.writeFile(inputPath, NOTES, (err) => {
    if (err) {
      console.error('could not write input:', err.message);
      process.exitCode = 1;
      return;
    }
    fs.readFile(inputPath, 'utf8', (err, raw) => {
      if (err) {
        console.error('could not read input:', err.message);
        process.exitCode = 1;
        return;
      }
      fs.writeFile(outputPath, tidy(raw), (err) => {
        if (err) {
          console.error('could not write output:', err.message);
          process.exitCode = 1;
          return;
        }
        fs.readFile(outputPath, 'utf8', (err, result) => {
          if (err) {
            console.error('could not read output:', err.message);
            process.exitCode = 1;
            return;
          }
          console.log('callback version finished. result:');
          console.log(result);
        });
      });
    });
  });
});
