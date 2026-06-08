import { NextResponse } from "next/server";
import { ingestHistoricalCsv } from "@/src/services/ingestion.service";

// Node runtime is required: we use the `postgres` driver and Node streams.
export const runtime = "nodejs";
// Streaming ingestion of ~100k rows can comfortably exceed the default 10s.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse multipart body" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` field in form data" },
      { status: 400 },
    );
  }

  const result = await ingestHistoricalCsv(file.stream());
  return NextResponse.json(result, { status: 200 });
}
