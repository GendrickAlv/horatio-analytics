// Next.js 15 instrumentation hook — runs once on Node startup before the
// server begins accepting requests. We use it to apply Drizzle migrations
// on production cold starts (Railway, Fly, Cloud Run, …) so a fresh
// deployment lands with the schema already present.
//
// Skipped in dev because the standard workflow runs `npm run db:migrate`
// manually. Skipped when SKIP_MIGRATIONS=1 in case an operator wants to
// run the container without touching the schema (e.g. for a smoke test
// against an existing DB).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SKIP_MIGRATIONS === "1") return;
  if (!process.env.DATABASE_URL) return;

  // Lazy import so the migrator only loads when we are about to run it.
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("./src/db/client");
  const { logger } = await import("./src/lib/logger");

  try {
    logger.info("applying database migrations");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    logger.info("database migrations applied");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown error";
    logger.error({ message }, "database migration failed");
    // Don't crash — let the health probe report degraded and the operator
    // diagnose from the logs. Crashing here would put the container in a
    // hot loop on Railway.
  }
}
