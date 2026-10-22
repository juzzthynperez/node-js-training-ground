// Route definitions for /api/v1/tasks — WHERE requests go, not what happens.
// The router is exported as a factory so tests (M09) can mount it on their own
// service; server-side wiring happens in app.ts.
//
// validate() sits BETWEEN the router and each handler: by the time a handler
// runs, its named request parts are parsed and typed — invalid input can
// never reach a handler, so it can never reach Prisma (M08 definition of done).

import { Router } from "express";
import { makeTaskHandlers } from "./task-handlers.ts";
import {
  createTaskSchema,
  idParamsSchema,
  listQuerySchema,
  updateTaskSchema,
} from "../schemas/task.schemas.ts";
import { validate } from "../middleware/validate.ts";
import type { TaskService } from "../services/task-service.ts";

export function makeTasksRouter(service: TaskService): Router {
  const router = Router();
  const handlers = makeTaskHandlers(service);

  router.get("/", validate({ query: listQuerySchema }), handlers.list);
  router.post("/", validate({ body: createTaskSchema }), handlers.create);
  router.get("/:id", validate({ params: idParamsSchema }), handlers.get);
  router.patch(
    "/:id",
    validate({ params: idParamsSchema, body: updateTaskSchema }),
    handlers.update,
  );
  // M09 (test-first): two path segments — cannot collide with "/:id" above
  // (which matches exactly one segment), so registration order is irrelevant.
  router.patch("/:id/complete", validate({ params: idParamsSchema }), handlers.complete);
  router.delete("/:id", validate({ params: idParamsSchema }), handlers.remove);

  return router;
}
