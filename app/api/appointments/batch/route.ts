import { NextResponse } from "next/server";
import { ingestBatch } from "@/src/services/ingestion.service";
import { batchRequestSchema } from "@/src/lib/validation";
import { zodIssuesToDiagnostics } from "@/src/lib/mappers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = batchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        // Reuse the shared mapper so the shape stays consistent across endpoints.
        diagnostics: zodIssuesToDiagnostics(
          0,
          parsed.error,
          {} as Record<string, string>,
        ),
      },
      { status: 400 },
    );
  }

  const result = await ingestBatch(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
