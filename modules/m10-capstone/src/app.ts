// app.ts — builds and exports the Express app. NEVER calls listen (that's
// server.ts's job; keeping them separate is what lets the Supertest tests
// import the app without opening a port).
//
// Middleware order is the design (M05 lesson): request-id FIRST (so
// everything downstream, including error responses, can carry the id) →
// body parsing → routes → 404 → central error handler LAST (error middleware
// must come after routers or it never sees their errors).
//
// Build order note (plan): feature routers (auth, books, authors, loans) are
// mounted by their own feature branches in plan order, each re-verifying this
// file on the way through.

import express, { type Express } from "express";
import type { AppConfig } from "./config.ts";
import { prisma } from "./db.ts";
import { errorHandlerFactory } from "./middleware/error-handler.ts";
import { notFound } from "./middleware/not-found.ts";
import { requestId } from "./middleware/request-id.ts";
import { makeAuthRouter } from "./routes/auth.ts";
import { AuthService } from "./services/auth.service.ts";

export function buildApp(config: AppConfig): Express {
  const app = express();
  // The auth service owns the single PrismaClient singleton — the app never
  // touches the database directly (the M05 store seam, new engine).
  const authService = new AuthService(prisma, config);

  // 1. Identity first — every later step (including error envelopes) can
  //    rely on req.requestId.
  app.use(requestId);

  // 2. Body parsing.
  app.use(express.json());

  // 3. Health endpoint (unversioned: it's operational, not a resource).
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  // 4. Feature routers (auth first; books/authors/loans join in plan order).
  app.use("/api/v1/auth", makeAuthRouter(authService));

  // 5. Unmatched routes funnel into the central handler.
  app.use(notFound);

  // 6. Central error handler — must be last.
  app.use(errorHandlerFactory({ isProduction: config.isProduction }));

  return app;
}
