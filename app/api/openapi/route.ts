import { NextResponse } from "next/server";
import { openApiDocument } from "@/src/openapi";

export const runtime = "nodejs";

export function GET(): Response {
  return NextResponse.json(openApiDocument, { status: 200 });
}
