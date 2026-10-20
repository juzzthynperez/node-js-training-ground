// The Task domain, carried forward from M04's task-domain types, trimmed to the
// fixed v1 contract from brief.md: id, title, description (optional), status.
// users/tags exist in the M06 schema design but are NOT part of the v1 API.

export type TaskStatus = "todo" | "in_progress" | "done";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "done"];

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
}
