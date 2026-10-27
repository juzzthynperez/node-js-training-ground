// server.ts — the ONLY file that calls listen. Reads config, starts the
// server, and shuts down gracefully on SIGTERM: server.close() stops accepting
// new connections and lets in-flight requests finish, then we exit.

import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = buildApp(config);

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "listening",
      port: config.port,
      env: config.isProduction ? "production" : "development",
    }),
  );
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: "info", message: "shutdown", signal }));
  server.close((err) => {
    if (err) {
      console.error(JSON.stringify({ level: "error", message: err.message }));
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
