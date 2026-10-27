// scripts/prove-race.ts — the capstone's concurrency evidence (plan step 8).
//
//   npm run prove:race        (needs at least one migration applied: npm run db:deploy)
//
// What it does, in two phases against ONE contested book, each as ~20
// PARALLEL HTTP requests:
//
//   BEFORE — a scratch app whose borrow route is the naive check-then-write:
//   READ availability, decide, then WRITE — no transaction. The 25ms gap
//   between check and write is explicit and labeled: it models the network /
//   IO latency that sits between the check and the write in ANY deployed
//   check-then-write (a single local process would otherwise get lucky by
//   running both halves inside one event-loop turn — production does not get
//   that luck). Requests that pass the check during the gap all create loans:
//   the book is double-booked, and the script counts exactly how badly.
//
//   AFTER — the REAL application (buildApp + LoanService, prisma.$transaction)
//   under the same load. The check and the write are one atomic unit, so a
//   loser observes the winner's commit and answers 409.
//
// The script ASSERTS its own claims and exits non-zero if they don't hold:
//   before: >1 successful 201 (otherwise: no demonstrated bug → fail loudly)
//   after:  exactly 1×201 and 19×409, one loan row, available=false
// Output is meant to be pasted VERBATIM into the write-up.

import express, { type Request, type Response } from "express";
import request from "supertest";
import { loadConfig } from "../src/config.ts";
import { buildApp } from "../src/app.ts";
import { prisma } from "../src/db.ts";
import { signToken } from "../src/lib/jwt.ts";

const PARALLEL_REQUESTS = 20;
const NAIVE_LATENCY_WINDOW_MS = 25;
const FIXTURE_EMAIL = "race-prover@library.test";
const FIXTURE_ISBN = "isbn-race-prove";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Tally {
  statuses: number[];
}

function summarize(label: string, tally: Tally, loanRows: number, available: boolean): void {
  const count = (status: number): number => tally.statuses.filter((s) => s === status).length;
  const other = tally.statuses.length - count(201) - count(409) - count(404);
  console.log(
    [
      label,
      `  201 (created): ${count(201)}`,
      `  409 (refused): ${count(409)}`,
      `  404 (unknown): ${count(404)}`,
      `  other:         ${other}`,
      `  loans rows for the contested book: ${loanRows}`,
      `  book.available: ${available}`,
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const config = loadConfig();

  // ---- fixture (owned by this script; other seed rows untouched) --------
  const member = await prisma.user.upsert({
    where: { email: FIXTURE_EMAIL },
    update: {},
    create: {
      name: "Race Prover",
      email: FIXTURE_EMAIL,
      passwordHash: "fixture-only-not-a-login",
      role: "MEMBER",
    },
  });
  const book = await prisma.book.upsert({
    where: { isbn: FIXTURE_ISBN },
    update: { title: "The Contested Copy", available: true },
    create: { title: "The Contested Copy", isbn: FIXTURE_ISBN, available: true },
  });
  await prisma.loan.deleteMany({ where: { bookId: book.id } });

  // ---- BEFORE: naive check-then-write, no transaction -------------------
  const naiveApp = express();
  naiveApp.use(express.json());
  const beforeTally: Tally = { statuses: [] };
  naiveApp.post("/naive-loans", async (req: Request, res: Response) => {
    const { bookId, userId } = req.body as { bookId: string; userId: string };
    const row = await prisma.book.findUnique({ where: { id: bookId } }); // READ
    if (row === null) {
      beforeTally.statuses.push(404);
      res.status(404).end();
      return;
    }
    const active = await prisma.loan.count({ where: { bookId, returnedAt: null } }); // CHECK
    if (active > 0) {
      beforeTally.statuses.push(409);
      res.status(409).end();
      return;
    }
    // THE WINDOW: between check and write — network/IO latency in any real
    // deployment. Everything that passes the check during this gap will
    // create a loan: this is the double-borrow.
    await delay(NAIVE_LATENCY_WINDOW_MS);
    await prisma.loan.create({
      data: { userId, bookId, dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    }); // WRITE 1
    await prisma.book.update({ where: { id: bookId }, data: { available: false } }); // WRITE 2
    beforeTally.statuses.push(201);
    res.status(201).end();
  });

  const beforeAttempts = await Promise.all(
    Array.from({ length: PARALLEL_REQUESTS }, () =>
      request(naiveApp)
        .post("/naive-loans")
        .send({ bookId: book.id, userId: member.id }),
    ),
  );
  void beforeAttempts; // statuses captured in the route itself (response side)
  const beforeRows = await prisma.loan.count({ where: { bookId: book.id } });
  const beforeBook = await prisma.book.findUnique({ where: { id: book.id } });
  console.log(
    `\nBEFORE — naive check-then-write (no transaction), ${PARALLEL_REQUESTS} parallel POST /naive-loans:`,
  );
  summarize("  (status tallied by the server route)", beforeTally, beforeRows, beforeBook?.available ?? false);

  // ---- AFTER: the real application, same load ---------------------------
  await prisma.loan.deleteMany({ where: { bookId: book.id } });
  await prisma.book.update({ where: { id: book.id }, data: { available: true } });

  const realApp = buildApp(config);
  const token = signToken({ sub: member.id, role: member.role }, config);
  const afterTally: Tally = { statuses: [] };
  const afterAttempts = await Promise.all(
    Array.from({ length: PARALLEL_REQUESTS }, () =>
      request(realApp)
        .post("/api/v1/loans")
        .set("Authorization", `Bearer ${token}`)
        .send({ bookId: book.id })
        .then((res) => {
          afterTally.statuses.push(res.status);
          return res;
        }),
    ),
  );
  void afterAttempts;
  const afterRows = await prisma.loan.count({ where: { bookId: book.id } });
  const afterBook = await prisma.book.findUnique({ where: { id: book.id } });
  console.log(
    `\nAFTER — fixed service (prisma.$transaction), ${PARALLEL_REQUESTS} parallel POST /api/v1/loans:`,
  );
  summarize("  (status tallied from responses)", afterTally, afterRows, afterBook?.available ?? false);

  // ---- assertions: the script fails loudly if it didn't prove anything ---
  const beforeWins = beforeTally.statuses.filter((s) => s === 201).length;
  const after201 = afterTally.statuses.filter((s) => s === 201).length;
  const after409 = afterTally.statuses.filter((s) => s === 409).length;
  const afterOther = PARALLEL_REQUESTS - after201 - after409;

  const problems: string[] = [];
  if (beforeWins <= 1) {
    problems.push(
      `BEFORE did not reproduce the bug (${beforeWins}×201) — a before that never double-books proves nothing`,
    );
  }
  if (beforeRows <= 1) {
    problems.push(`BEFORE left ${beforeRows} loan row(s) — expected >1 (double-booked)`);
  }
  if (after201 !== 1) problems.push(`AFTER had ${after201} winners, expected exactly 1`);
  if (after409 !== PARALLEL_REQUESTS - 1) {
    problems.push(`AFTER refused ${after409}, expected ${PARALLEL_REQUESTS - 1}`);
  }
  if (afterOther !== 0) problems.push(`AFTER produced ${afterOther} non-(201/409) responses`);
  if (afterRows !== 1) problems.push(`AFTER left ${afterRows} loan row(s), expected exactly 1`);

  if (problems.length > 0) {
    console.error(`\nPROOF FAILED:\n  - ${problems.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nPROOF HELD: before double-booked (${beforeWins} winners → ${beforeRows} loans), ` +
        `after kept exactly one winner (${after201}×201, ${after409}×409, ${afterRows} loan).`,
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
