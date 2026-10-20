// In-memory task store — v1's deliberate persistence "solution" (M07 swaps it
// for Prisma without the routes knowing, if we keep the store interface small).

import { randomUUID } from "node:crypto";
import type { Task, TaskStatus } from "./task-types.ts";

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
}

export class TaskStore {
  readonly #tasks = new Map<string, Task>();

  list(): Task[] {
    return [...this.#tasks.values()];
  }

  get(id: string): Task | undefined {
    return this.#tasks.get(id);
  }

  /** 409 check lives in the store: duplicate titles are a data-rule, not a routing rule. */
  hasTitle(title: string, exceptId?: string): boolean {
    for (const task of this.#tasks.values()) {
      if (task.title === title && task.id !== exceptId) return true;
    }
    return false;
  }

  create(input: CreateTaskInput): Task {
    const task: Task = { id: randomUUID(), ...input };
    this.#tasks.set(task.id, task);
    return task;
  }

  update(id: string, patch: UpdateTaskInput): Task | undefined {
    const existing = this.#tasks.get(id);
    if (!existing) return undefined;
    const updated: Task = {
      ...existing,
      ...patch,
      description: patch.description !== undefined ? patch.description : existing.description,
    };
    this.#tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.#tasks.delete(id);
  }
}
