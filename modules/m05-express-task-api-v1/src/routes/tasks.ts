// Route definitions for /api/v1/tasks — WHERE requests go, not what happens.
// The router is exported as a factory so tests (M09) can mount it on their own
// store; server-side wiring happens in app.ts.

import { Router } from "express";
import { makeTaskHandlers } from "./task-handlers.ts";
import type { TaskStore } from "../store.ts";

export function makeTasksRouter(store: TaskStore): Router {
  const router = Router();
  const handlers = makeTaskHandlers(store);

  router.get("/", handlers.list);
  router.post("/", handlers.create);
  router.get("/:id", handlers.get);
  router.patch("/:id", handlers.update);
  router.delete("/:id", handlers.remove);

  return router;
}
