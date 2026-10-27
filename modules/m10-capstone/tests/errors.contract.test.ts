// Error-contract verification (plan step 4) — the ONE consistent shape,
// asserted as EXACT key sets so an accidental extra field fails the suite:
// every error response is `{ error: { code, message, details?, requestId? } }`
// and nothing else. Real app for the pipeline cases; a probe app for validate()
// precedence and both arms of the 500 rendering.

import { describe, expect, it } from "@jest/globals";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { errorHandlerFactory } from "../src/middleware/error-handler.ts";
import { notFound } from "../src/middleware/not-found.ts";
import { requestId } from "../src/middleware/request-id.ts";
import { getValid, validate } from "../src/middleware/validate.ts";

function makeTestApp(): Express {
  return buildApp(loadConfig());
}

/** Probe app: the full envelope chain around ONE route, parameterized by
 *  environment so both 500 renderings are asserted, not assumed. */
function buildProbeApp(options: { isProduction: boolean; route: string }): Express {
  const app = express();
  app.use(requestId);
  app.use(express.json());

  app.post(
    "/probe",
    validate({
      // Message on BOTH the type and the min issue (m08's pattern): a MISSING
      // key fires the type issue, an empty string fires the min issue — the
      // frozen wording must cover whichever arrives.
      body: z
        .object({
          name: z
            .string({ error: "Required, non-empty string" })
            .min(1, { error: "Required, non-empty string" }),
        })
        .strict(),
    }),
    (req: Request, res: Response) => {
      res.status(200).json({ parsed: getValid(req, "body", z.object({ name: z.string() })) });
    },
  );

  app.get(
    "/probe/:id",
    validate({
      params: z.object({ id: z.uuid() }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );

  app.get(options.route, () => {
    throw new Error("unhandled boom");
  });

  app.use(notFound);
  app.use(errorHandlerFactory({ isProduction: options.isProduction }));
  return app;
}

describe("404 funnel — unmatched routes use the envelope", () => {
  it("answers NOT_FOUND with the exact error key set and a requestId", async () => {
    const res = await request(makeTestApp()).get("/no-such-route");
    expect(res.status).toBe(404);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message", "requestId"]);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toContain("GET /no-such-route");
    expect(res.body.error.details).toBeUndefined();
    expect(typeof res.body.error.requestId).toBe("string");
  });

  it("honors an inbound x-request-id end to end (header and envelope)", async () => {
    const res = await request(makeTestApp())
      .get("/nope")
      .set("x-request-id", "trace-abc-123");
    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
    expect(res.body.error.requestId).toBe("trace-abc-123");
  });

  it("generates an x-request-id when the client sends none", async () => {
    const res = await request(makeTestApp()).get("/nope");
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("malformed JSON — the 400 branch, not a 500", () => {
  it("answers VALIDATION_ERROR 'Body must be valid JSON' with no details", async () => {
    const res = await request(makeTestApp())
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Body must be valid JSON");
    expect(res.body.error.details).toBeUndefined();
    expect(Object.keys(res.body.error).sort()).toEqual(["code", "message", "requestId"]);
  });
});

describe("validate() middleware — parsed parts, frozen details", () => {
  it("passes parsed input through getValid on success", async () => {
    const res = await request(buildProbeApp({ isProduction: false, route: "/boom" }))
      .post("/probe")
      .send({ name: "Ada" });
    expect(res.status).toBe(200);
    expect(res.body.parsed.name).toBe("Ada");
  });

  it("rejects a missing field with one detail in the envelope", async () => {
    const res = await request(buildProbeApp({ isProduction: false, route: "/boom" }))
      .post("/probe")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual([
      { path: "name", message: "Required, non-empty string" },
    ]);
  });

  it("expands an unknown key to one 'Unknown field' detail (M08 mapping)", async () => {
    const res = await request(buildProbeApp({ isProduction: false, route: "/boom" }))
      .post("/probe")
      .send({ name: "Ada", nickname: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "nickname", message: "Unknown field" }]);
  });

  it("checks params BEFORE body when both are invalid (M07 precedence)", async () => {
    const res = await request(buildProbeApp({ isProduction: false, route: "/boom" }))
      .get("/probe/not-a-uuid")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveLength(1);
    expect(res.body.error.details[0].path).toBe("id");
  });
});

describe("programmer errors — the 500 renders per environment, never a stack", () => {
  it("development arm echoes the message and no stack frames", async () => {
    const res = await request(buildProbeApp({ isProduction: false, route: "/boom" })).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.message).toBe("unhandled boom");
    // The contract: no stack ever on the wire (the dev affordance is the
    // message echo, which is fixture-clean by construction).
    expect(JSON.stringify(res.body)).not.toContain(".ts:");
    expect(res.body.error).not.toHaveProperty("stack");
  });

  it("production arm hides the message entirely", async () => {
    const res = await request(buildProbeApp({ isProduction: true, route: "/boom" })).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.message).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("unhandled boom");
  });
});
