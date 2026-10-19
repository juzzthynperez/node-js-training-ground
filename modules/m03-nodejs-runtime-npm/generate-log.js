/**
 * generate-log.js — trainer-provided fixture generator for the M03 lab.
 *
 * Trainees do NOT write this script; the brief says generating the practice data
 * is not part of the lab. It produces a synthetic, newline-delimited access-log
 * file (~100 MB by default) where each record looks like:
 *
 *   203.0.113.42 - - [19/Oct/2026:10:15:07 +0000] "GET /api/users?page=3 HTTP/1.1" 200 4821
 *
 * Usage:
 *   node generate-log.js --out <path> [--mb 100]
 *
 * The default output lives outside git: pass a path under evidence/ (gitignored)
 * or anywhere outside the repository. The generated file is data, not source —
 * it is never committed.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string', short: 'o' },
    mb: { type: 'string', default: '100' },
  },
});

if (!values.out) {
  console.error('Usage: node generate-log.js --out <path> [--mb 100]');
  process.exit(1);
}

const targetBytes = Math.round(Number(values.mb) * 1024 * 1024);
if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
  console.error(`Invalid --mb value: ${values.mb}`);
  process.exit(1);
}

const PATHS = [
  '/', '/index.html', '/about', '/contact', '/api/users', '/api/users?page=2',
  '/api/users?page=3', '/api/orders', '/api/orders?status=open', '/api/products',
  '/api/products?category=tools', '/static/app.js', '/static/style.css',
  '/static/logo.png', '/login', '/logout', '/signup', '/search?q=node',
  '/health', '/metrics', '/favicon.ico',
];
const STATUSES = [200, 200, 200, 200, 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 404, 429, 500, 502];
const METHODS = ['GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'POST', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
  'curl/8.5.0',
  'node-fetch/3.3.2',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function logLine(seq) {
  const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  const method = pick(METHODS);
  const path = pick(PATHS);
  const status = pick(STATUSES);
  const bytes = Math.floor(Math.random() * 20000);
  const ts = new Date(Date.now() - Math.floor(Math.random() * 86_400_000))
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ' +0000')
    .replace(/-(\d\d)-(\d\d)/, '/$1/$2');
  const agent = pick(AGENTS);
  return `${ip} - - [${ts}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${agent}" #${seq}\n`;
}

await mkdir(dirname(values.out), { recursive: true });
const stream = createWriteStream(values.out, { encoding: 'utf8' });

let written = 0;
let seq = 0;
const CHUNK_LINES = 20_000;

function writeChunk(readyForMore) {
  let ok = true;
  while (ok && written < targetBytes) {
    let batch = '';
    for (let i = 0; i < CHUNK_LINES && written < targetBytes; i++) {
      const line = logLine(++seq);
      batch += line;
      written += Buffer.byteLength(line);
    }
    ok = stream.write(batch);
  }
  if (written >= targetBytes) {
    stream.end();
  } else {
    stream.once('drain', readyForMore);
  }
}

await new Promise((resolve, reject) => {
  stream.on('error', reject);
  const pump = () => writeChunk(pump);
  stream.on('finish', resolve);
  pump();
});

console.log(
  `Wrote ${(written / 1024 / 1024).toFixed(1)} MB (${seq} records) to ${values.out}`,
);
