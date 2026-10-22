// Request handlers for /api/v1/tasks — separated from the route definitions in
// tasks.ts (M05 decision: routes say WHERE, handlers say WHAT).
// No try/catch anywhere: in Express 5 a rejected async handler promise is
// forwarded to the central error handler automatically, so `throw new
// NotFoundError(...)` inside an async handler just works.
//
// M08 changes, and only these: every hand-written validation is GONE.
// validate() ran in routes/tasks.ts BEFORE these functions execute, and every
// input type below is derived with z.infer from the same schema the middleware
// used — there is no hand-written request interface left to drift. req.body
// and req.query are never read here; raw input never reaches business logic.

import type { Request, Response } from "express";
import { getValid } from "../middleware/validate.ts";
import {
  createTaskSchema,
  idParamsSchema,
  listQuerySchema,
  updateTaskSchema,
} from "../schemas/task.schemas.ts";
import type { TaskService } from "../services/task-service.ts";

export function makeTaskHandlers(service: TaskService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      // Type comes from the schema (z.infer), not from ListOptions written by
      // hand: change the schema and tsc points straight at this line.
      const options = getValid(req, "query", listQuerySchema);
      const { data, meta } = await service.list(options);
      res.status(200).json({ data, meta });
    },

    async create(req: Request, res: Response): Promise<void> {
      const input = getValid(req, "body", createTaskSchema);
      const task = await service.create(input);
      res.status(201).location(`/api/v1/tasks/${task.id}`).json({ data: task });
    },

    async get(req: Request, res: Response): Promise<void> {
      const { id } = getValid(req, "params", idParamsSchema);
      const task = await service.getById(id);
      res.status(200).json({ data: task });
    },

    async update(req: Request, res: Response): Promise<void> {
      const { id } = getValid(req, "params", idParamsSchema);
      const patch = getValid(req, "body", updateTaskSchema);
      const task = await service.update(id, patch);
      res.status(200).json({ data: task });
    },

    async remove(req: Request, res: Response): Promise<void> {
      const { id } = getValid(req, "params", idParamsSchema);
      await service.remove(id);
      res.sendStatus(204);
    },

    // M09 (test-first): no body exists on this endpoint, so the params gate
    // idParamsSchema is the whole request contract — nothing to parse beyond it.
    async complete(req: Request, res: Response): Promise<void> {
      const { id } = getValid(req, "params", idParamsSchema);
      const task = await service.complete(id);
      res.status(200).json({ data: task });
    },
  };
}
