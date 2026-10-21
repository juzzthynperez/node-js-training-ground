// 404 handler for unmatched routes — runs after all routers, funnels into the
// central error handler via next(err) so unmatched routes use the same envelope.

import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../errors.ts";

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}
