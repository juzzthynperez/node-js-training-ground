// ============================================================================
// M06 — SQL injection demo: vulnerable string concatenation vs parameterised
// query, run against the real schema from schema.sql / seed.sql.
//
// HOW TO RUN (Node 24 — this file needs the built-in node:sqlite module):
//   fnm exec --using=24 -- node injection-demo.mjs
//   (plain `node` on Node >= 22.5 also works if your default is recent enough)
//
// Requires task.db to exist:  (cat schema.sql seed.sql) | sqlite3 task.db
//
// Self-verifying: exits 0 only if the vulnerable query is bypassed (rows > 0),
// the parameterised query blocks the same payload (0 rows), AND a legitimate
// login still works through the parameterised query (1 row). That third check
// matters: parameters are not a kill switch for logins, they are a kill switch
// for *interpretation* of input.
//
// The "ExperimentalWarning: node:sqlite" line on stderr is expected on Node 24.
// ============================================================================
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(here, "task.db");

if (!existsSync(dbPath)) {
  console.error(
    `Missing ${dbPath} — build it first:\n` +
      "  (cat schema.sql seed.sql) | sqlite3 task.db",
  );
  process.exit(2);
}

const db = new DatabaseSync(dbPath);

// ----------------------------------------------------------------------------
// Round 1 — the vulnerable query: user input pasted INTO the SQL text.
// ----------------------------------------------------------------------------
const attackEmail = "' OR 1=1 -- ";
const attackPassword = "irrelevant";

const vulnerableSql =
  "SELECT id, name, email FROM users " +
  `WHERE email = '${attackEmail}' AND password_hash = '${attackPassword}'`;

console.log("--- VULNERABLE: string-concatenated query ---");
console.log("attacker email input :", attackEmail);
console.log("constructed SQL      :", vulnerableSql);

// The attacker's input is not DATA here — it is CODE. After substitution the
// statement reads:  WHERE email = '' OR 1=1 -- rest-of-line is a comment
// so the password check is gone and the WHERE is unconditionally true.
const vulnerableRows = db.prepare(vulnerableSql).all();
console.log("rows returned        :", vulnerableRows.length);
console.log("first row            :", JSON.stringify(vulnerableRows[0] ?? null));
console.log(
  vulnerableRows.length > 0
    ? "=> LOGIN SUCCEEDED — injection bypass worked (worst case: every account)."
    : "=> unexpected: bypass FAILED — demo broken, check seed data.",
);
console.log();

// ----------------------------------------------------------------------------
// Round 2 — the SAME inputs against the SAME conditions, parameterised.
// The driver sends SQL text and values separately; the value can never be
// re-parsed as SQL, so the payload below arrives as a literal string that
// simply matches no email in the table.
// ----------------------------------------------------------------------------
const parameterisedSql =
  "SELECT id, name, email FROM users WHERE email = ? AND password_hash = ?";

console.log("--- PARAMETERISED: same payload, bound as a value ---");
console.log("SQL                 :", parameterisedSql);
const attackRows = db.prepare(parameterisedSql).all(attackEmail, attackPassword);
console.log("attack rows returned:", attackRows.length);
console.log(
  attackRows.length === 0
    ? "=> ACCESS DENIED — the payload was data, not code, so it matched nothing."
    : "=> unexpected: attack still succeeded — demo broken.",
);
console.log();

// ----------------------------------------------------------------------------
// Round 3 — a legitimate login through the SAME parameterised query, proving
// blocking injection did not break normal use.
// ----------------------------------------------------------------------------
const goodRows = db.prepare(parameterisedSql).all(
  "alice@example.com",
  "scrypt$alice$fakehash001", // from seed.sql — a fake hash, this is a demo
);
console.log("--- LEGITIMATE LOGIN through the parameterised query ---");
console.log("rows returned       :", goodRows.length, JSON.stringify(goodRows[0] ?? null));
console.log(
  goodRows.length === 1
    ? "=> normal login works: parameters preserve intended behaviour."
    : "=> unexpected: legitimate login failed — demo broken.",
);
console.log();

db.close();

const pass = vulnerableRows.length > 0 && attackRows.length === 0 && goodRows.length === 1;
console.log(
  `RESULT: ${pass ? "PASS" : "FAIL"} ` +
    `(vulnerable=${vulnerableRows.length}, parameterised-attack=${attackRows.length}, ` +
    `legit=${goodRows.length})`,
);
process.exit(pass ? 0 : 1);
