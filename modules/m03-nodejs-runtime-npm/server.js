/**
 * server.js — M03 bare `node:http` server.
 *
 * Three JSON endpoints, with routing and body parsing written by hand — no
 * framework. The point of the exercise is to feel the pain a framework like
 * Express will later remove: hand-rolled routing, hand-rolled body assembly,
 * hand-rolled status codes, hand-rolled shutdown.
 *
 *   GET  /health  -> 200 { status: "ok", ... }
 *   GET  /items   -> 200 { items: [...] }
 *   POST /items   -> 201 { item: {...} }   (JSON body: { "name": string })
 *
 * Usage: node server.js   (PORT env var, default 3000)
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB cap on hand-parsed request bodies

// The "database": a plain in-memory array. No ORM in M03.
const items = [
  { id: randomUUID(), name: 'first item', createdAt: new Date().toISOString() },
  { id: randomUUID(), name: 'second item', createdAt: new Date().toISOString() },
];

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Hand-rolled body parsing: collect chunks up to the cap, then JSON.parse.
 * Everything a framework would give you for free lives in this one function:
 * timeouts, size limits, content-type checks, error shaping.
 */
function readJsonBody(req, res, onDone) {
  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: 'request body too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    if (chunks.length === 0) {
      onDone(new Error('empty body'));
      return;
    }
    try {
      onDone(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      onDone(new Error('invalid JSON'));
    }
  });

  req.on('error', (err) => {
    if (!aborted) onDone(err);
  });
}

// Hand-rolled routing: a method + pathname dispatch table.
const routes = {
  'GET /health': (req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      itemCount: items.length,
      pid: process.pid,
    });
  },

  'GET /items': (req, res) => {
    sendJson(res, 200, { items, count: items.length });
  },

  'POST /items': (req, res) => {
    readJsonBody(req, res, (err, body) => {
      if (err) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      if (typeof body?.name !== 'string' || body.name.trim() === '') {
        sendJson(res, 422, {
          error: 'validation failed',
          details: [{ path: 'name', message: 'name is required and must be a non-empty string' }],
        });
        return;
      }
      const item = {
        id: randomUUID(),
        name: body.name.trim(),
        createdAt: new Date().toISOString(),
      };
      items.push(item);
      sendJson(res, 201, { item });
    });
  },
};

const server = createServer((req, res) => {
  // Parse the URL by hand too — WHATWG URL against a dummy base.
  const url = new URL(req.url, 'http://localhost');
  const routeKey = `${req.method} ${url.pathname}`;

  const handler = routes[routeKey];
  if (handler) {
    handler(req, res);
    return;
  }

  // Distinguish "path exists, wrong method" (405) from "no such path" (404).
  const pathExists = Object.keys(routes).some((key) => key.split(' ')[1] === url.pathname);
  if (pathExists) {
    res.setHeader('allow', Object.keys(routes)
      .filter((key) => key.split(' ')[1] === url.pathname)
      .map((key) => key.split(' ')[0])
      .join(', '));
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  sendJson(res, 404, { error: `not found: ${routeKey}` });
});

// Graceful shutdown on SIGINT/SIGTERM — process signals are part of M03 scope.
function shutdown(signal) {
  console.log(`\n${signal} received — closing server gracefully`);
  server.close(() => {
    console.log('All connections drained; exiting');
    process.exit(0);
  });
  // Safety net: force-exit if a connection refuses to drain.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`bare http server listening on http://localhost:${PORT}`);
  console.log('endpoints: GET /health, GET /items, POST /items');
});
