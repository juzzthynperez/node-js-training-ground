// Logging middleware — one line per request: method, path, status, duration, requestId.
// Deliberately hand-rolled (like the validation) so M08-era readers can see every part;
// morgan/pino-http are the real-world alternatives named in the brief.

import type { NextFunction, Request, Response } from "express";

export function logging(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      JSON.stringify({
        level: "info",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      }),
    );
  });
  next();
}
