// Token provisioning for endpoint tests — every token comes from the REAL
// login endpoint (librarian accounts are DB-provisioned first, mirroring the
// seed; members go through registration). No test signs its own headers.

import request from "supertest";
import { buildApp } from "../../src/app.ts";
import { loadConfig } from "../../src/config.ts";
import { createUserRow } from "./db.ts";

export function testApp() {
  return buildApp(loadConfig());
}

export async function getMemberToken(email = "member@library.test"): Promise<string> {
  const res = await request(testApp())
    .post("/api/v1/auth/register")
    .send({ name: "Test Member", email, password: "member-pass-12" });
  if (res.status !== 201) {
    throw new Error(`member registration failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export async function getLibrarianToken(email = "librarian@library.test"): Promise<string> {
  await createUserRow({
    name: "Test Librarian",
    email,
    password: "librarian-pass-9",
    role: "LIBRARIAN",
  });
  const res = await request(testApp())
    .post("/api/v1/auth/login")
    .send({ email, password: "librarian-pass-9" });
  if (res.status !== 200) {
    throw new Error(`librarian login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}
