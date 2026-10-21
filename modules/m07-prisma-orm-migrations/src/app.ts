// app.ts — builds and exports the Express app. NEVER calls listen (that's
// server.ts's job; keeping them separate is what lets M09's Supertest tests
// import the app without opening a port).
//
// Middleware order is the design: request-id FIRST (so everything downstream,
// including error responses, can carry the id) → logging (observes the whole
// pipeline) → security/built-ins → routes → 404 → central error handler LAST
// (error middleware must come after routers or it never sees their errors).

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import type { AppConfig } from "./config.ts";
import { prisma } from "./db.ts";
import { errorHandlerFactory } from "./middleware/error-handler.ts";
import { logging } from "./middleware/logging.ts";
import { notFound } from "./middleware/not-found.ts";
import { requestId } from "./middleware/request-id.ts";
import { makeTasksRouter } from "./routes/tasks.ts";
import { TaskService } from "./services/task-service.ts";

export function buildApp(config: AppConfig): Express {
  const app = express();
  // The service owns the single PrismaClient singleton from db.ts — the app
  // never touches the database directly (M05's store seam, new engine).
  const taskService = new TaskService(prisma);

  // 1. Identity and observability first — every later step can rely on both.
  app.use(requestId);
  app.use(logging);

  // 2. Security and body parsing.
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // 3. Health endpoint (unversioned: it's operational, not a resource).
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  // 4. The one resource of v1.
  app.use("/api/v1/tasks", makeTasksRouter(taskService));

  // 5. Unmatched routes funnel into the central handler.
  app.use(notFound);

  // 6. Central error handler — must be last.
  app.use(errorHandlerFactory({ isProduction: config.isProduction }));

  return app;
}
