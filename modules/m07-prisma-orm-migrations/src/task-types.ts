// The Task domain, carried forward from M04's task-domain types, extended for
// the v2 contract: the wire shape GAINED priority and dueDate (additive — the
// M05 Bruno tests assert presence of the original fields, never absence of
// new ones). The write path is unchanged: priority is decided by the service
// layer, and dueDate/priority are not settable through the API until M08's Zod
// schemas widen the input contract.

export type TaskStatus = "todo" | "in_progress" | "done";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "done"];

// The three values that may ever appear in tasks.priority. NOT enforced by the
// database (SQLite via Prisma has no CHECK) and not settable via the API yet —
// this union describes what the service layer produces and reads.
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null; // ISO-8601 on the wire, null when unset
}
