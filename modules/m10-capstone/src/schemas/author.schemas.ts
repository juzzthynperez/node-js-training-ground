// src/schemas/author.schemas.ts — the request contract for authors (CRUD).
// Same decisions as book.schemas.ts: non-strict bodies (unknown keys
// stripped, M07/M08 parity), PATCH requires at least one own field,
// UUID params gated before the service sees them.

import { z } from "zod";

const NAME_MESSAGE = "name must be a non-empty string";

export const authorParamsSchema = z.object({
  id: z.uuid({ error: "id must be a UUID" }),
});

export const createAuthorSchema = z.object({
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, { error: NAME_MESSAGE }).max(120, {
    error: "name must be at most 120 characters",
  }),
  bio: z.string({ error: "bio must be a string" }).max(2000, {
    error: "bio must be at most 2000 characters",
  }).optional(),
});

export const updateAuthorSchema = z
  .object({
    name: z.string({ error: NAME_MESSAGE }).trim().min(1, { error: NAME_MESSAGE }).max(120, {
      error: "name must be at most 120 characters",
    }).optional(),
    bio: z.string({ error: "bio must be a string" }).max(2000, {
      error: "bio must be at most 2000 characters",
    }).optional(),
  })
  .refine((body) => body.name !== undefined || body.bio !== undefined, {
    error: "At least one field to update is required (name, bio)",
  });

export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;
export type UpdateAuthorInput = z.infer<typeof updateAuthorSchema>;
