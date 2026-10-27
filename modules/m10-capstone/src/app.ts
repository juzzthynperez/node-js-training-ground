// app.ts — builds and exports the Express app. NEVER calls listen (that's
// server.ts's job; keeping them separate is what lets the Supertest tests
// import the app without opening a port).
//
// Build order note (plan): this is the SKELETON stage — health check only.
// The request-id/error middleware chain and every feature router are mounted
// by their own feature branches in plan order (error contract → auth →
// CRUD/list → loans), each re-verifying this file on the way through.

import express, { type Express } from "express";
import type { AppConfig } from "./config.ts";

export function buildApp(config: AppConfig): Express {
  const app = express();

  // Body parsing. (Security/observability middleware joins with the error
  // contract feature, which is where requestId starts feeding the envelope.)
  app.use(express.json());

  // Health endpoint (unversioned: it's operational, not a resource).
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  return app;
}
