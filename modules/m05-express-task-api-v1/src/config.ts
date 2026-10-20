// Config from environment variables — hand-read with defaults, deliberately:
// M08 will replace this with Zod-validated config (pain before payoff).

export interface AppConfig {
  port: number;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}"`);
  }
  return {
    port,
    isProduction: env.NODE_ENV === "production",
  };
}
