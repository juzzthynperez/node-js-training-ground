// src/schemas/task.schemas.ts — the REQUEST contract of Task API v3.
//
// One file is the single source of truth: these schemas validate untrusted
// input at runtime (nothing else may read req.body/req.query), and every
// handler input type is DERIVED from them with z.infer — there is no
// hand-written request interface anywhere in the codebase anymore.
//
// Every custom message below reproduces a string the M05/M07 wire contract
// froze and the Bruno collection asserts, verified against the installed
// Zod 4.6.7 (evidence/m08/zod4-api-check.txt) — messages are passed with the
// unified string `error` parameter, the one form this Zod build accepts on
// every schema and check.
//
// Derivation, not duplication: the create schema owns the field definitions;
// the update schema is create.partial().strict(); the query and params schemas
// reuse the same field vocabulary.

import { z } from "zod";
import { TASK_STATUSES } from "../task-types.ts";

/** Frozen M05 strings — changing any of these changes the wire contract.
 *  m07 deliberately used DIFFERENT wording per context for the same field
 *  (create vs PATCH); that split is wire-visible, so both live here verbatim
 *  instead of being unified into one prettier sentence. */
const MESSAGES = {
  body: "Body must be a JSON object",
  title: "Required, non-empty string", // create context
  titlePatch: "Must be a non-empty string", // PATCH context
  status: `Must be one of: ${TASK_STATUSES.join(", ")}`,
  description: "Must be a string when present", // create context
  descriptionPatch: "Must be a string", // PATCH context
  atLeastOne: "At least one of title, description, status is required",
  repeated: "Must not be repeated",
  uuid: "Must be a UUID",
  sort: "Must be one of: createdAt, title, dueDate",
  order: "Must be one of: asc, desc",
  page: "Must be a positive integer",
  pageSize: "Must be an integer between 1 and 100",
} as const;

// ---- shared fields ---------------------------------------------------------

const statusField = z.enum(TASK_STATUSES, { error: MESSAGES.status });

const SORTABLE_FIELDS = ["createdAt", "title", "dueDate"] as const;

/** The three request fields, declared ONCE and parameterized only by their
 *  context message: m07 froze create and PATCH wording separately ("Required,
 *  non-empty string" vs "Must be a non-empty string"), and wire-visible
 *  strings are contract — so the logic is shared, the wording is not.
 *  NOTE there is deliberately NO default here: both request schemas derive
 *  from a bare base, because `.partial()` over `.default("todo")` still fires
 *  the default for an absent key — an empty PATCH would silently carry
 *  status:"todo", satisfy the cross-field refine, and answer 200 instead of
 *  400 (observed live during the first Bruno run — evidence/m08/bruno-run.txt). */
function taskFields(context: { title: string; description: string }) {
  return {
    title: z.string({ error: context.title }).trim().min(1, { error: context.title }), // Zod 4 runs string checks in order: trim FIRST, then min(1)
    description: z.string({ error: context.description }).optional(),
    status: statusField,
  };
}

// ---- create ----------------------------------------------------------------

/** Non-strict on purpose: unknown keys are STRIPPED (M07 parity — create
 *  never rejected unknown fields), title arrives trimmed, status defaults. */
export const createTaskSchema = z.object(
  {
    ...taskFields({ title: MESSAGES.title, description: MESSAGES.description }),
    status: statusField.default("todo"),
  },
  { error: MESSAGES.body },
);

// ---- update ----------------------------------------------------------------

/** Derived from the same field factory with .partial() (no field logic
 *  re-declared) + .strict(): unknown keys are REJECTED — one detail per key
 *  at path <key> (M07 parity: "Unknown field"). The cross-field .refine()
 *  collects "empty patch" as a whole-object issue, which lands at path "" in
 *  the envelope. */
export const updateTaskSchema = z
  .object(taskFields({ title: MESSAGES.titlePatch, description: MESSAGES.descriptionPatch }), {
    error: MESSAGES.body,
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { error: MESSAGES.atLeastOne });

// ---- list query ------------------------------------------------------------

/** A query param arrives as a string — unless repeated (?status=a&status=b),
 *  which Express parses into an array. Silently dropping an array would answer
 *  the request UNFILTERED (a 200 that lies), so a repeated param is a
 *  validation error with its own message. Empty string means ABSENT (M07
 *  parity: `?status=` filters nothing instead of failing). The guard runs in
 *  the schema, before the inner type — never as a hand-written check. */
function queryParam<S extends z.ZodType>(inner: S) {
  return z
    .unknown()
    .refine((value) => !Array.isArray(value), { error: MESSAGES.repeated })
    .pipe(z.preprocess((value: unknown) => (value === "" ? undefined : value), inner.optional()))
    // The outer .optional() is load-bearing, not decoration: Zod's object
    // parser decides whether a MISSING key is acceptable from the field's
    // top-level type, and a bare pipe is not marked optional — an absent
    // query param came back as "expected nonoptional, received undefined"
    // for every field (observed live: even a queryless GET /tasks 400'd).
    .optional();
}

/** All problems are collected per-field by Zod and surface in ONE 400 with
 *  a details entry per path (Bruno v2/08 asserts status+sort+page together). */
export const listQuerySchema = z.object({
  status: queryParam(statusField),
  q: queryParam(z.string().trim()),
  sort: queryParam(z.enum(SORTABLE_FIELDS, { error: MESSAGES.sort })),
  order: queryParam(z.enum(["asc", "desc"], { error: MESSAGES.order })),
  page: queryParam(
    z.coerce.number({ error: MESSAGES.page }).int({ error: MESSAGES.page }).min(1, { error: MESSAGES.page }),
  ),
  pageSize: queryParam(
    z
      .coerce.number({ error: MESSAGES.pageSize })
      .int({ error: MESSAGES.pageSize })
      .min(1, { error: MESSAGES.pageSize })
      .max(100, { error: MESSAGES.pageSize }),
  ),
});

// ---- route params ----------------------------------------------------------

/** z.uuid() parity with the old hand-written regex, settled against the
 *  installed binary: accepts the fixed seed UUIDs (v4 shape) and the NIL
 *  UUID exactly like /^[0-9a-f]{8}-…$/i did. */
export const idParamsSchema = z.object({ id: z.uuid({ error: MESSAGES.uuid }) });

// ---- derived types — the ONLY request types in the codebase ----------------

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListOptions = z.infer<typeof listQuerySchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
