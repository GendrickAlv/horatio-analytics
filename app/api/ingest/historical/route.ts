import { NextResponse } from "next/server";
import { ingestHistoricalCsv } from "@/src/services/ingestion.service";
import { CsvHeaderError } from "@/src/lib/csv";
import { MAX_HISTORICAL_BYTES, checkBodySize } from "@/src/lib/security";

// Node runtime is required: we use the `postgres` driver and Node streams.
export const runtime = "nodejs";
// Streaming ingestion of ~100k rows can comfortably exceed the default 10s.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const sizeCheck = checkBodySize(request, MAX_HISTORICAL_BYTES);
  if (!sizeCheck.ok) {
    return NextResponse.json(
      { error: sizeCheck.error },
      { status: sizeCheck.status },
    );
  }

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

  try {
    const result = await ingestHistoricalCsv(file.stream());
    return NextResponse.json(result, { status: 200 });
  } catch (cause) {
    // Header errors are a client fault — respond with a 400 carrying the diff
    // so the operator can see exactly which columns are wrong without reading
    // logs.
    if (cause instanceof CsvHeaderError) {
      return NextResponse.json(
        {
          error: cause.message,
          missing: cause.missing,
          unexpected: cause.unexpected,
        },
        { status: 400 },
      );
    }
    throw cause;
  }
}
