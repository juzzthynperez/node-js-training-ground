// src/routes/auth.ts — POST /register and POST /login.
//
// validate() sits between router and handler (bad input never reaches the
// service), handlers are async (Express 5 forwards rejections to the central
// handler — no try/catch anywhere). Rate limiting joins in the next feature
// branch (plan order), scoped to exactly these two routes.

import { Router, type Request, type Response } from "express";
import { getValid, validate } from "../middleware/validate.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.ts";
import type { AuthService } from "../services/auth.service.ts";

export function makeAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post(
    "/register",
    validate({ body: registerSchema }),
    async (req: Request, res: Response) => {
      const input = getValid(req, "body", registerSchema);
      const result = await authService.register(input);
      res.status(201).json(result);
    },
  );

  router.post("/login", validate({ body: loginSchema }), async (req: Request, res: Response) => {
    const input = getValid(req, "body", loginSchema);
    const result = await authService.login(input);
    res.status(200).json(result);
  });

  return router;
}
