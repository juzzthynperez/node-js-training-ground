// src/routes/auth.ts — POST /register and POST /login.
//
// validate() sits between router and handler (bad input never reaches the
// service), handlers are async (Express 5 forwards rejections to the central
// handler — no try/catch anywhere).
//
// Rate limiting: ONE limiter instance shared by exactly these two routes —
// brute-force protection for BOTH credential endpoints against a single
// config-driven budget (RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_MS). Its handler
// calls next(new RateLimitError()) so the 429 flows through the CENTRAL
// handler like every other error: same envelope, same requestId — not the
// library's default plaintext body. Nothing else in the API is rate limited;
// the test suite proves /health stays open after the auth endpoints trip.

import { rateLimit } from "express-rate-limit";
import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.ts";
import { RateLimitError } from "../errors.ts";
import { getValid, validate } from "../middleware/validate.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.ts";
import type { AuthService } from "../services/auth.service.ts";

export function makeAuthRouter(authService: AuthService, config: AppConfig): Router {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    // Route the trip into OUR error pipeline: the envelope shape is a rubric
    // requirement, and RateLimitError carries code RATE_LIMITED + requestId.
    handler: (_req, _res, next) => {
      next(new RateLimitError());
    },
  });

  router.post(
    "/register",
    authLimiter,
    validate({ body: registerSchema }),
    async (req: Request, res: Response) => {
      const input = getValid(req, "body", registerSchema);
      const result = await authService.register(input);
      res.status(201).json(result);
    },
  );

  router.post("/login", authLimiter, validate({ body: loginSchema }), async (req: Request, res: Response) => {
    const input = getValid(req, "body", loginSchema);
    const result = await authService.login(input);
    res.status(200).json(result);
  });

  return router;
}
