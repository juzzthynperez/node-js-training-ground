// src/routes/loans.ts — borrowing, returning, and the caller's loan history.
//
// All three require an identity (requireAuth); NONE of them is librarian-only:
// borrowing is what members DO, and librarians handle desk returns (the
// service enforces owner-OR-librarian on return). The wrong-role answer for
// a MEMBER touching another member's loan is 403 from the service — the
// envelope routes it exactly like every other authorization refusal.

import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.ts";
import { requireAuth } from "../middleware/auth.ts";
import { getValid, validate } from "../middleware/validate.ts";
import { borrowSchema, loanParamsSchema } from "../schemas/loan.schemas.ts";
import type { LoanService } from "../services/loan.service.ts";

export function makeLoansRouter(loanService: LoanService, config: AppConfig): Router {
  const router = Router();

  router.get("/", requireAuth(config), async (req: Request, res: Response) => {
    const items = await loanService.listMine(req.user!.userId);
    res.status(200).json({ items });
  });

  router.post(
    "/",
    requireAuth(config),
    validate({ body: borrowSchema }),
    async (req: Request, res: Response) => {
      const { bookId } = getValid(req, "body", borrowSchema);
      const loan = await loanService.borrow(req.user!, bookId);
      res.status(201).json(loan);
    },
  );

  router.post(
    "/:id/return",
    requireAuth(config),
    validate({ params: loanParamsSchema }),
    async (req: Request, res: Response) => {
      const { id } = getValid(req, "params", loanParamsSchema);
      const loan = await loanService.returnLoan(req.user!, id);
      res.status(200).json(loan);
    },
  );

  return router;
}
