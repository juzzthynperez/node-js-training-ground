// Request-ID middleware — must run FIRST so that the requestId is available to
// logging and to the error envelope. Accepts an inbound x-request-id (what a
// gateway or a client's Bruno script might send) or generates one.

import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
