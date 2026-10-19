/**
 * log-report.js — the M03 `log-report` CLI.
 *
 * Streams a large newline-delimited access-log file, aggregates counts, and
 * writes a JSON report. The file is read as a stream and parsed line by line —
 * it is never loaded into memory whole, which is the point of the exercise.
 *
 * Usage:
 *   node log-report.js --file <path> [--out report.json] [--top 10]
 *
 * Exit codes: 0 on success, 1 on any user-facing error (bad options, unreadable
 * file, write failure).
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';

const { values: args } = parseArgs({
  options: {
    file: { type: 'string', short: 'f' },
    out: { type: 'string', short: 'o', default: 'log-report.json' },
    top: { type: 'string', default: '10' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help || !args.file) {
  console.log('Usage: node log-report.js --file <path> [--out report.json] [--top 10]');
  process.exit(args.help ? 0 : 1);
}

const topN = Number(args.top);
if (!Number.isInteger(topN) || topN < 1) {
  console.error(`Invalid --top value: ${args.top}`);
  process.exit(1);
}

// Access-log record: IP ident user [timestamp] "METHOD path PROTO" status bytes
const LOG_PATTERN =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\w+) (\S+) [^"]*" (\d{3}) (\d+|-)/;

/** Tracks peak RSS while the stream runs — printed so streaming behavior is visible. */
let peakRssBytes = process.memoryUsage.rss();
const rssSampler = setInterval(() => {
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
}, 25);
rssSampler.unref();

async function main() {
  let fileStats;
  try {
    fileStats = await stat(args.file);
  } catch {
    console.error(`Cannot read log file: ${args.file}`);
    process.exit(1);
  }
  if (!fileStats.isFile()) {
    console.error(`Not a regular file: ${args.file}`);
    process.exit(1);
  }

  const startedAt = Date.now();
  const statusCounts = new Map();
  const pathCounts = new Map();
  const methodCounts = new Map();
  let lineCount = 0;
  let parsedCount = 0;
  let malformedCount = 0;
  let totalBytesServed = 0;

  // Stream the file: one line at a time, constant memory regardless of file size.
  const source = createReadStream(args.file, { encoding: 'utf8' });
  const lines = createInterface({ input: source, crlfDelay: Infinity });

  for await (const line of lines) {
    if (line.length === 0) continue;
    lineCount += 1;
    const match = LOG_PATTERN.exec(line);
    if (!match) {
      malformedCount += 1;
      continue;
    }
    parsedCount += 1;
    const [, , , method, path, status, bytes] = match;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
    if (bytes !== '-') totalBytesServed += Number(bytes);
  }

  clearInterval(rssSampler);
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());

  const toSortedObject = (map) =>
    Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));

  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([path, count]) => ({ path, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      file: args.file,
      fileBytes: fileStats.size,
      lines: lineCount,
      parsed: parsedCount,
      malformed: malformedCount,
    },
    totals: {
      requests: parsedCount,
      bytesServed: totalBytesServed,
      distinctPaths: pathCounts.size,
    },
    statusCodes: toSortedObject(statusCounts),
    methods: toSortedObject(methodCounts),
    topPaths,
    streaming: {
      peakRssMb: Math.round((peakRssBytes / 1024 / 1024) * 10) / 10,
      note: 'peak resident memory while streaming; independent of file size',
    },
    durationMs: Date.now() - startedAt,
  };

  const out = createWriteStream(args.out, { encoding: 'utf8' });
  out.end(JSON.stringify(report, null, 2) + '\n');
  await once(out, 'close');

  console.log(`Report written to ${args.out}`);
  console.log(
    `Parsed ${parsedCount}/${lineCount} lines from ` +
      `${(fileStats.size / 1024 / 1024).toFixed(1)} MB in ${report.durationMs} ms ` +
      `(peak RSS ${report.streaming.peakRssMb} MB)`,
  );
}

main().catch((err) => {
  clearInterval(rssSampler);
  console.error(`log-report failed: ${err.message}`);
  process.exit(1);
});
