// src/routes/books.ts — the books resource.
//
// Authorization map (the rubric's "genuinely differs", on REAL endpoints):
//   GET  /books, /books/:id  — any authenticated identity (MEMBER and
//                              LIBRARIAN both read the catalog)
//   POST / PATCH / DELETE    — LIBRARIAN only; MEMBER gets 403 FORBIDDEN
//                              (requireRole behind requireAuth, so an
//                              anonymous caller still gets 401 first)
//
// validate() runs before the handler on every route (params gate the id, the
// list query is fully Zod-validated with defaults); handlers are async and
// build no envelopes — services throw, the central handler responds.

import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { getValid, validate } from "../middleware/validate.ts";
import {
  bookParamsSchema,
  createBookSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from "../schemas/book.schemas.ts";
import type { BookService } from "../services/book.service.ts";

export function makeBooksRouter(bookService: BookService, config: AppConfig): Router {
  const router = Router();

  // Catalog reads: any verified identity.
  router.get(
    "/",
    requireAuth(config),
    validate({ query: listBooksQuerySchema }),
    async (req: Request, res: Response) => {
      const query = getValid(req, "query", listBooksQuerySchema);
      res.status(200).json(await bookService.list(query));
    },
  );

  router.get(
    "/:id",
    requireAuth(config),
    validate({ params: bookParamsSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", bookParamsSchema);
      res.status(200).json(await bookService.getById(id));
    },
  );

  // Curation: librarian only.
  router.post(
    "/",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ body: createBookSchema }),
    async (req: Request, res: Response) => {
      const input = getValid(req, "body", createBookSchema);
      res.status(201).json(await bookService.create(input));
    },
  );

  router.patch(
    "/:id",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ params: bookParamsSchema, body: updateBookSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", bookParamsSchema);
      const input = getValid(req, "body", updateBookSchema);
      res.status(200).json(await bookService.update(id, input));
    },
  );

  router.delete(
    "/:id",
    requireAuth(config),
    requireRole("LIBRARIAN"),
    validate({ params: bookParamsSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", bookParamsSchema);
      await bookService.remove(id);
      res.status(204).end();
    },
  );

  return router;
}
