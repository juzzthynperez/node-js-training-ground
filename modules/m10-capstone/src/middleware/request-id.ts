// Request-ID middleware — must run FIRST so that the requestId is available to
// the error envelope (and any logging added later). Accepts an inbound
// x-request-id (what a gateway or a client's Bruno script might send) or
// generates one. Verbatim M05/M08 behavior.

import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get("x-request-id");
  req.requestId = inbound && inbound.trim() !== "" ? inbound.trim() : randomUUID();
  res.set("x-request-id", req.requestId);
  next();
}
