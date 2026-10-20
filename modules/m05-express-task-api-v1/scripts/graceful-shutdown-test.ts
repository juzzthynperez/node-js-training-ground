// Evidence driver: spawn the server as a child, wait for "listening", send
// SIGTERM from Node (on Windows Node emulates SIGTERM for its own children via
// the console ctrl handler path), capture the child's graceful-shutdown output.
// Run: node scripts/graceful-shutdown-test.ts  (via tsx)
import { spawn } from "node:child_process";

const child = spawn("npx", ["tsx", "src/server.ts"], {
  env: { ...process.env, PORT: "3457" },
  stdio: ["ignore", "pipe", "pipe"],
  shell: true, // Windows: npx is npx.cmd; Node emulates SIGTERM for shell-spawned children
});

let output = "";
child.stdout.on("data", (chunk: Buffer) => {
  output += chunk.toString();
  if (output.includes('"message":"listening"')) {
    console.log("child output before signal:\n" + output.trim());
    console.log("\n-> sending SIGTERM");
    child.kill("SIGTERM");
  }
});
child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
child.on("exit", (code, signal) => {
  console.log("child output in full:\n" + output.trim());
  console.log(`\nchild exited: code=${code} signal=${signal}`);
  const graceful = output.includes('"message":"shutdown"') && code === 0;
  console.log(graceful ? "RESULT: GRACEFUL (shutdown handler ran, exit 0)" : "RESULT: NOT GRACEFUL");
  process.exit(graceful ? 0 : 1);
});
