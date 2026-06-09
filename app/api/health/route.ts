import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/src/db/client";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";
// Always evaluate against the real database; cached "ok" defeats the purpose
// of a liveness probe.
export const dynamic = "force-dynamic";

// Liveness + readiness in one probe. Returns 200 only when the Postgres pool
// can serve a trivial query — orchestrators (k8s, ECS, Docker healthcheck)
// then correctly take the container out of rotation if the DB is gone.
export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      { status: "ok", checks: { database: "ok" } },
      { status: 200 },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown error";
    logger.warn({ message }, "health probe failed");
    return NextResponse.json(
      { status: "degraded", checks: { database: "unreachable" } },
      { status: 503 },
    );
  }
}
