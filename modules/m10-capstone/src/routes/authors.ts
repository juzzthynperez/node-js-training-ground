// src/routes/authors.ts — the authors resource. Same authorization map as
// books: reads for any authenticated identity, create/update/delete
// LIBRARIAN-only (the catalog-curation boundary, applied uniformly).

import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { getValid, validate } from "../middleware/validate.ts";
import {
  authorParamsSchema,
  createAuthorSchema,
  updateAuthorSchema,
} from "../schemas/author.schemas.ts";
import type { AuthorService } from "../services/author.service.ts";

export function makeAuthorsRouter(authorService: AuthorService, config: AppConfig): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(config),
    async (_req: Request, res: Response) => {
      res.status(200).json({ items: await authorService.list() });
    },
  );

  router.get(
    "/:id",
    requireAuth(config),
    validate({ params: authorParamsSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", authorParamsSchema);
      res.status(200).json(await authorService.getById(id));
    },
  );

  router.post(
    "/",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ body: createAuthorSchema }),
    async (req: Request, res: Response) => {
      const input = getValid(req, "body", createAuthorSchema);
      res.status(201).json(await authorService.create(input));
    },
  );

  router.patch(
    "/:id",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ params: authorParamsSchema, body: updateAuthorSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", authorParamsSchema);
      const input = getValid(req, "body", updateAuthorSchema);
      res.status(200).json(await authorService.update(id, input));
    },
  );

  router.delete(
    "/:id",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ params: authorParamsSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", authorParamsSchema);
      await authorService.remove(id);
      res.status(204).end();
    },
  );

  return router;
}
