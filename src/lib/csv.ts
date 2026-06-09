import { parse } from "csv-parse";
import { Readable } from "node:stream";

export interface CsvRecord {
  row: number;
  record: Record<string, string>;
}

// The canonical Kaggle CSV header — order is not asserted (csv-parse keys
// the record by name) but presence + absence of unexpected columns is.
export const EXPECTED_CSV_COLUMNS = [
  "PatientId",
  "AppointmentID",
  "Gender",
  "ScheduledDay",
  "AppointmentDay",
  "Age",
  "Neighbourhood",
  "Scholarship",
  "Hipertension",
  "Diabetes",
  "Alcoholism",
  "Handcap",
  "SMS_received",
  "No-show",
] as const;

// Distinct error class so the route handler can map it to 400 instead of 500.
// Carries the diff for a useful client-facing message.
export class CsvHeaderError extends Error {
  constructor(
    public readonly missing: string[],
    public readonly unexpected: string[],
  ) {
    const parts: string[] = [];
    if (missing.length > 0)
      parts.push(`missing columns: ${missing.join(", ")}`);
    if (unexpected.length > 0)
      parts.push(`unexpected columns: ${unexpected.join(", ")}`);
    super(
      parts.length > 0
        ? `CSV header mismatch — ${parts.join("; ")}`
        : "CSV header mismatch",
    );
    this.name = "CsvHeaderError";
  }
}

function diffHeader(actual: readonly string[]): {
  missing: string[];
  unexpected: string[];
} {
  const expected = new Set<string>(EXPECTED_CSV_COLUMNS);
  const actualSet = new Set(actual);
  const missing = EXPECTED_CSV_COLUMNS.filter((c) => !actualSet.has(c));
  const unexpected = actual.filter((c) => !expected.has(c));
  return { missing, unexpected };
}

// Convert a Web ReadableStream (what `request.formData()` → File.stream() returns)
// into a Node Readable so csv-parse can consume it in true streaming fashion.
function toNodeReadable(
  source: Readable | ReadableStream<Uint8Array>,
): Readable {
  if (source instanceof Readable) return source;
  return Readable.fromWeb(source as Parameters<typeof Readable.fromWeb>[0]);
}

// Stream a CSV body, yielding one parsed record at a time with its 1-based row
// number. Backpressure is preserved end-to-end so we never buffer the entire
// 100k-row file in memory. The header row is validated against
// EXPECTED_CSV_COLUMNS before any record is yielded — a mismatch surfaces as
// a CsvHeaderError so the caller can respond with a 400 instead of letting
// every row fail validation with confusing per-field errors.
export async function* streamCsvRecords(
  source: Readable | ReadableStream<Uint8Array>,
): AsyncGenerator<CsvRecord> {
  const parser = parse({
    columns: (header: string[]) => {
      const { missing, unexpected } = diffHeader(header);
      if (missing.length > 0 || unexpected.length > 0) {
        throw new CsvHeaderError(missing, unexpected);
      }
      return header;
    },
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  toNodeReadable(source).pipe(parser);

  let row = 0;
  for await (const record of parser) {
    row += 1;
    yield { row, record: record as Record<string, string> };
  }
}
