import { parse } from "csv-parse";
import { Readable } from "node:stream";

export interface CsvRecord {
  row: number;
  record: Record<string, string>;
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
// 100k-row file in memory.
export async function* streamCsvRecords(
  source: Readable | ReadableStream<Uint8Array>,
): AsyncGenerator<CsvRecord> {
  const parser = parse({
    columns: true,
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
