// task-service.ts — EVERY database operation of Task API v2 lives here.
// This file replaces M05's src/store.ts wholesale: same callers (the handlers),
// same wire contract, different engine — the seam M05 was designed around.
//
// Three decisions worth reading before the code:
//
// 1. THE DEFAULT OWNER. The M05 API is userless (its contract has no userId),
//    but tasks.user_id is NOT NULL. The service therefore pins every
//    API-created task to one seeded owner whose id is a FIXED constant the
//    seed script also uses. Because all API writes land in one owner, the
//    DB's per-owner unique (user_id, title) enforces exactly the global
//    "one title, one task" rule M05's 409 promised — the three layers stay
//    aligned: API 409 == DB unique for API data, seed stays globally unique.
//
// 2. THE ERROR SEAM. Prisma errors never leak past this file: mapPrismaError
//    translates the three known codes into the M05 AppError hierarchy
//    (P2002 -> ConflictError/409, P2025 -> NotFoundError/404,
//    P2003 -> BadRequestError/400), and the untouched central error handler
//    renders them into the program-wide envelope like any other AppError.
//
// 3. priority IS DECIDED HERE, NOT IN THE DATABASE. The add_priority migration
//    made the column NOT NULL with no default on purpose: "medium" is an
//    application policy, and policies belong in application code.

import { Prisma, type PrismaClient, type Task as TaskRow } from "../generated/prisma/client.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.ts";
import type { Task, TaskPriority, TaskStatus } from "../task-types.ts";
// M08: the input shapes are no longer interfaces written here — they are
// z.infer aliases exported by the schema that validates the request. One
// source: the schema validates at runtime AND types this service, so request
// contract and persistence contract cannot drift.
import type { CreateTaskInput, ListOptions, UpdateTaskInput } from "../schemas/task.schemas.ts";

export type { CreateTaskInput, ListOptions, UpdateTaskInput };

/** The seeded user every API-created task belongs to (see prisma/seed.ts). */
export const DEFAULT_OWNER_ID = "00000000-0000-4000-8000-000000000001";

export const DEFAULT_PRIORITY: TaskPriority = "medium";

// M08 removed the three hand-written input interfaces that lived here
// (CreateTaskInput / UpdateTaskInput / ListOptions). They now come from
// src/schemas/task.schemas.ts as z.infer aliases — imported above, re-exported
// above for existing consumers. Derive, don't redeclare.

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Translate a known Prisma error into the AppError the central handler
 * already understands. Anything else is returned UNCHANGED so it stays a
 * programmer error (500, nothing leaked) — the M05 trust boundary holds.
 */
export function mapPrismaError(err: unknown, context: { title?: string; id?: string } = {}): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return new ConflictError(
          context.title !== undefined
            ? `A task with title "${context.title}" already exists`
            : "Resource conflict",
        );
      case "P2025":
        return new NotFoundError(
          context.id !== undefined ? `Task ${context.id} not found` : "Resource not found",
        );
      case "P2003":
        // A row referenced a parent that does not exist (foreign key
        // violation). The caller sent (or the service computed) a reference
        // to something that was never there — a bad reference, not a state
        // clash, so 400 rather than 409. Unreachable through the tasks-only
        // API (the owner is a pinned constant); proven via direct client
        // call in evidence/m07/error-mapping.txt.
        return new BadRequestError("Referenced resource does not exist");
    }
  }
  return err;
}

/** DB row -> wire Task. description is omitted when empty — with one honest
 *  caveat: v1 ECHOED an explicitly-supplied "" while v2 renders "" as absent,
 *  because the M06 schema stores description NOT NULL DEFAULT '' and cannot
 *  distinguish "cleared" from "never set". Same stored value, one fewer wire
 *  shape; documented in the M07 write-up.
 *  dueDate travels as an ISO string or null — dates are text on the wire. */
function toWire(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    ...(row.description !== "" ? { description: row.description } : {}),
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  };
}

export class TaskService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Filtered, sorted, paginated listing. data + total are fetched in ONE
   *  batch $transaction: two queries, one transaction, one consistency point. */
  async list(options: ListOptions = {}): Promise<{ data: Task[]; meta: ListMeta }> {
    const { status, q, sort = "createdAt", order = "desc", page = 1, pageSize = 20 } = options;

    const where: Prisma.TaskWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: [{ [sort]: order }, { id: "asc" }], // id tiebreak = deterministic pages
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: rows.map(toWire),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getById(id: string): Promise<Task> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    if (!row) throw new NotFoundError(`Task ${id} not found`);
    return toWire(row);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    try {
      // This literal is the persistence boundary: `satisfies
      // Prisma.TaskUncheckedCreateInput` makes tsc prove the Zod-typed input
      // lines up with Prisma's contract. UNCHECKED, not TaskCreateInput: this
      // data is all scalars (userId FK + columns, no nested `user:` write),
      // and userId/priority are service policy deliberately absent from the
      // request schema.
      const data = {
        userId: DEFAULT_OWNER_ID,
        title: input.title,
        ...(input.description !== undefined ? { description: input.description } : {}),
        status: input.status,
        priority: DEFAULT_PRIORITY, // application policy, not a DB default
      } satisfies Prisma.TaskUncheckedCreateInput;
      const row = await this.prisma.task.create({ data });
      return toWire(row);
    } catch (err) {
      // Duplicate title trips @@unique([userId, title]) -> P2002 -> 409.
      throw mapPrismaError(err, { title: input.title });
    }
  }

  async update(id: string, patch: UpdateTaskInput): Promise<Task> {
    // M05's update checked duplicate titles BEFORE existence (store.hasTitle
    // ran first), so PATCHing a missing id with a taken title answered 409,
    // not 404. That ordering is part of the v1 wire behaviour, so it is
    // preserved here explicitly — the Prisma update alone would answer 404.
    if (patch.title !== undefined) {
      const clash = await this.prisma.task.findFirst({
        where: { userId: DEFAULT_OWNER_ID, title: patch.title, NOT: { id } },
      });
      if (clash) throw new ConflictError(`A task with title "${patch.title}" already exists`);
    }
    try {
      const row = await this.prisma.task.update({
        where: { id },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          // updatedAt is bumped by Prisma itself (@updatedAt) — nothing to set.
        } satisfies Prisma.TaskUpdateInput,
      });
      return toWire(row);
    } catch (err) {
      // Missing id -> P2025 -> 404; duplicate title -> P2002 -> 409.
      throw mapPrismaError(err, { id, ...(patch.title !== undefined ? { title: patch.title } : {}) });
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.task.delete({ where: { id } });
    } catch (err) {
      // Deleting what is not there -> P2025 -> 404, same as v1's behaviour.
      throw mapPrismaError(err, { id });
    }
  }
}
