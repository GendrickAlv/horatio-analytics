import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { logger } from "../lib/logger";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and start the Postgres container with `docker-compose up -d`.",
  );
}

// Reuse the postgres client across Next.js HMR reloads in development to avoid
// exhausting the connection pool. In production each runtime instance gets one.
const globalForPostgres = globalThis as unknown as {
  __postgresClient?: ReturnType<typeof postgres>;
  __shutdownRegistered?: boolean;
};

const client =
  globalForPostgres.__postgresClient ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.__postgresClient = client;
}

// Graceful shutdown: when the container receives SIGTERM (k8s, ECS,
// `docker stop`) drain in-flight queries before exiting. Only wired in
// production — dev and test rely on Ctrl-C / Vitest's own lifecycle and
// installing extra signal handlers there confuses things.
if (
  process.env.NODE_ENV === "production" &&
  !globalForPostgres.__shutdownRegistered
) {
  globalForPostgres.__shutdownRegistered = true;
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutdown signal received; draining postgres pool");
    void client
      .end({ timeout: 5 })
      .then(() => {
        logger.info("postgres pool closed");
        process.exit(0);
      })
      .catch((cause: unknown) => {
        logger.error(
          { message: cause instanceof Error ? cause.message : "unknown" },
          "postgres pool drain failed",
        );
        process.exit(1);
      });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Database = typeof db;
export { schema };
