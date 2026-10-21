// Hand-written validation, deliberately: M08 replaces every function here with
// Zod schemas + a typed validate middleware, and the pain of doing it by hand
// is the point. Each validator returns ErrorDetail[] — empty means valid.

import type { ErrorDetail } from "../errors.ts";
import { TASK_STATUSES, type TaskStatus } from "../task-types.ts";
// M07: input shapes moved from the (deleted) store.ts into the service; the
// shapes themselves are unchanged, so this import is the ONLY line of this
// file the Prisma swap touched. The validator logic below is byte-identical
// to M05's — this file is the frozen seam M08 replaces with Zod.
import type { CreateTaskInput, UpdateTaskInput } from "../services/task-service.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCreateTask(body: unknown): {
  input?: CreateTaskInput;
  errors: ErrorDetail[];
} {
  const errors: ErrorDetail[] = [];
  if (!isPlainObject(body)) {
    return { errors: [{ path: "", message: "Body must be a JSON object" }] };
  }

  const title = body.title;
  if (typeof title !== "string" || title.trim() === "") {
    errors.push({ path: "title", message: "Required, non-empty string" });
  }
  if ("description" in body && body.description !== undefined && typeof body.description !== "string") {
    errors.push({ path: "description", message: "Must be a string when present" });
  }
  const status = body.status ?? "todo";
  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    errors.push({
      path: "status",
      message: `Must be one of: ${TASK_STATUSES.join(", ")}`,
    });
  }

  if (errors.length > 0) return { errors };
  return {
    input: {
      title: (title as string).trim(),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      status: status as TaskStatus,
    },
    errors,
  };
}

export function validateUpdateTask(body: unknown): {
  patch?: UpdateTaskInput;
  errors: ErrorDetail[];
} {
  const errors: ErrorDetail[] = [];
  if (!isPlainObject(body)) {
    return { errors: [{ path: "", message: "Body must be a JSON object" }] };
  }

  const patch: UpdateTaskInput = {};
  const known = ["title", "description", "status"] as const;

  for (const key of Object.keys(body)) {
    if (!known.includes(key as (typeof known)[number])) {
      errors.push({ path: key, message: "Unknown field" });
    }
  }

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim() === "") {
      errors.push({ path: "title", message: "Must be a non-empty string" });
    } else {
      patch.title = body.title.trim();
    }
  }
  if ("description" in body) {
    if (body.description !== undefined && typeof body.description !== "string") {
      errors.push({ path: "description", message: "Must be a string" });
    } else {
      patch.description = body.description as string | undefined;
    }
  }
  if ("status" in body) {
    if (!TASK_STATUSES.includes(body.status as TaskStatus)) {
      errors.push({
        path: "status",
        message: `Must be one of: ${TASK_STATUSES.join(", ")}`,
      });
    } else {
      patch.status = body.status as TaskStatus;
    }
  }

  if (errors.length > 0) return { errors };
  if (Object.keys(patch).length === 0) {
    return { errors: [{ path: "", message: "At least one of title, description, status is required" }] };
  }
  return { patch, errors };
}

/** UUID shape check — the store only ever holds randomUUID ids. */
export function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
