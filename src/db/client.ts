import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Database = typeof db;
export { schema };
