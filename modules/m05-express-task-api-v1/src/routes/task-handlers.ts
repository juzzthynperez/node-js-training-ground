// Request handlers for /api/v1/tasks — separated from the route definitions in
// tasks.ts (M05 decision: routes say WHERE, handlers say WHAT).
// No try/catch anywhere: in Express 5 a rejected async handler promise is
// forwarded to the central error handler automatically, so `throw new
// NotFoundError(...)` inside an async handler just works.

import type { Request, Response } from "express";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.ts";
import {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
} from "../middleware/validation.ts";
import type { TaskStore } from "../store.ts";

type TaskParams = { id: string };

export function makeTaskHandlers(store: TaskStore) {
  return {
    async list(_req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: store.list() });
    },

    async create(req: Request, res: Response): Promise<void> {
      const { input, errors } = validateCreateTask(req.body);
      if (!input) throw new BadRequestError("Request validation failed", errors);
      if (store.hasTitle(input.title)) {
        throw new ConflictError(`A task with title "${input.title}" already exists`);
      }
      const task = store.create(input);
      res.status(201).location(`/api/v1/tasks/${task.id}`).json({ data: task });
    },

    async get(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      const task = store.get(id);
      if (!task) throw new NotFoundError(`Task ${id} not found`);
      res.status(200).json({ data: task });
    },

    async update(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      const { patch, errors } = validateUpdateTask(req.body);
      if (!patch) throw new BadRequestError("Request validation failed", errors);
      if (patch.title !== undefined && store.hasTitle(patch.title, id)) {
        throw new ConflictError(`A task with title "${patch.title}" already exists`);
      }
      const task = store.update(id, patch);
      if (!task) throw new NotFoundError(`Task ${id} not found`);
      res.status(200).json({ data: task });
    },

    async remove(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      const deleted = store.delete(id);
      if (!deleted) throw new NotFoundError(`Task ${id} not found`);
      res.sendStatus(204);
    },
  };
}
