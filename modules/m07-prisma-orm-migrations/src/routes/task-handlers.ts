// Request handlers for /api/v1/tasks — separated from the route definitions in
// tasks.ts (M05 decision: routes say WHERE, handlers say WHAT).
// No try/catch anywhere: in Express 5 a rejected async handler promise is
// forwarded to the central error handler automatically, so `throw new
// NotFoundError(...)` inside an async handler just works.
//
// M07 changes, and only these: the handlers talk to TaskService instead of
// TaskStore, and the list handler grew query parameters (status, q, sort,
// order, page, pageSize). Duplicate-title conflicts are no longer PRE-CHECKED
// here — the service raises P2002 and maps it to the same ConflictError, so
// the wire behaviour (409 + envelope) is unchanged.
//
// validateListQuery lives HERE rather than in middleware/validation.ts on
// purpose: M05's validators are the frozen seam M08 replaces with Zod, and
// query-shape validation is HTTP-adjacent — it belongs next to the handlers
// that read req.query. Same ErrorDetail[] output contract, so the envelope
// comes out identical.

import type { Request, Response } from "express";
import { BadRequestError, type ErrorDetail } from "../errors.ts";
import {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
} from "../middleware/validation.ts";
import { TASK_STATUSES, type TaskStatus } from "../task-types.ts";
import type { ListOptions, TaskService } from "../services/task-service.ts";

type TaskParams = { id: string };

const SORTABLE_FIELDS = ["createdAt", "title", "dueDate"] as const;
type SortField = (typeof SORTABLE_FIELDS)[number];

function parsePositiveInt(value: string): number | undefined {
  if (!/^[1-9][0-9]*$/.test(value)) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** A query param arrives as a string — unless it is repeated (?status=a&
 *  status=b), which Express parses into an array. Silently dropping an array
 *  would answer the request UNFILTERED, the worst possible failure: a 200
 *  that lies. Repeated params are therefore a validation error. */
function asSingleParam(value: unknown, path: string, errors: ErrorDetail[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  errors.push({ path, message: "Must not be repeated" });
  return undefined;
}

/** req.query -> validated ListOptions. Every problem collected as an
 *  ErrorDetail so one 400 can report all of them at once. */
function validateListQuery(query: Record<string, unknown>): ListOptions {
  const errors: ErrorDetail[] = [];
  const options: ListOptions = {};

  const status = asSingleParam(query.status, "status", errors);
  if (typeof status === "string" && status !== "") {
    if (TASK_STATUSES.includes(status as TaskStatus)) {
      options.status = status as TaskStatus;
    } else {
      errors.push({ path: "status", message: `Must be one of: ${TASK_STATUSES.join(", ")}` });
    }
  }

  const q = asSingleParam(query.q, "q", errors);
  if (typeof q === "string" && q.trim() !== "") {
    options.q = q.trim();
  }

  const sort = asSingleParam(query.sort, "sort", errors);
  if (typeof sort === "string" && sort !== "") {
    if (SORTABLE_FIELDS.includes(sort as SortField)) {
      options.sort = sort as SortField;
    } else {
      errors.push({ path: "sort", message: `Must be one of: ${SORTABLE_FIELDS.join(", ")}` });
    }
  }

  const order = asSingleParam(query.order, "order", errors);
  if (typeof order === "string" && order !== "") {
    if (order === "asc" || order === "desc") {
      options.order = order;
    } else {
      errors.push({ path: "order", message: "Must be one of: asc, desc" });
    }
  }

  const page = asSingleParam(query.page, "page", errors);
  if (typeof page === "string" && page !== "") {
    const parsed = parsePositiveInt(page);
    if (parsed !== undefined) options.page = parsed;
    else errors.push({ path: "page", message: "Must be a positive integer" });
  }

  const pageSize = asSingleParam(query.pageSize, "pageSize", errors);
  if (typeof pageSize === "string" && pageSize !== "") {
    const parsed = parsePositiveInt(pageSize);
    if (parsed !== undefined && parsed <= 100) options.pageSize = parsed;
    else errors.push({ path: "pageSize", message: "Must be an integer between 1 and 100" });
  }

  if (errors.length > 0) throw new BadRequestError("Request validation failed", errors);
  return options;
}

export function makeTaskHandlers(service: TaskService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const options = validateListQuery(req.query as Record<string, unknown>);
      const { data, meta } = await service.list(options);
      res.status(200).json({ data, meta });
    },

    async create(req: Request, res: Response): Promise<void> {
      const { input, errors } = validateCreateTask(req.body);
      if (!input) throw new BadRequestError("Request validation failed", errors);
      const task = await service.create(input);
      res.status(201).location(`/api/v1/tasks/${task.id}`).json({ data: task });
    },

    async get(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      const task = await service.getById(id);
      res.status(200).json({ data: task });
    },

    async update(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      const { patch, errors } = validateUpdateTask(req.body);
      if (!patch) throw new BadRequestError("Request validation failed", errors);
      const task = await service.update(id, patch);
      res.status(200).json({ data: task });
    },

    async remove(req: Request<TaskParams>, res: Response): Promise<void> {
      const { id } = req.params;
      if (!isValidId(id)) throw new BadRequestError("Request validation failed", [
        { path: "id", message: "Must be a UUID" },
      ]);
      await service.remove(id);
      res.sendStatus(204);
    },
  };
}
