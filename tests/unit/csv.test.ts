import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  CsvHeaderError,
  streamCsvRecords,
  type CsvRecord,
} from "@/src/lib/csv";

function streamFromString(body: string): ReadableStream<Uint8Array> {
  const node = Readable.from([Buffer.from(body, "utf8")]);
  return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
}

async function collect(body: string): Promise<CsvRecord[]> {
  const out: CsvRecord[] = [];
  for await (const record of streamCsvRecords(streamFromString(body))) {
    out.push(record);
  }
  return out;
}

const validHeader =
  "PatientId,AppointmentID,Gender,ScheduledDay,AppointmentDay,Age,Neighbourhood,Scholarship,Hipertension,Diabetes,Alcoholism,Handcap,SMS_received,No-show";
const oneRow =
  "1,10,F,2016-04-01T10:00:00Z,2016-04-02T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes";

describe("streamCsvRecords header validation", () => {
  it("accepts a CSV with the canonical header", async () => {
    const out = await collect([validHeader, oneRow].join("\n"));
    expect(out).toHaveLength(1);
    expect(out[0]?.record.Gender).toBe("F");
  });

  it("rejects a missing column with CsvHeaderError", async () => {
    const badHeader = validHeader.replace(",No-show", "");
    const body = [badHeader, oneRow.replace(/,Yes$/, "")].join("\n");
    await expect(collect(body)).rejects.toThrow(CsvHeaderError);
  });

  it("rejects an unexpected column with CsvHeaderError", async () => {
    const badHeader = `${validHeader},Extra`;
    const body = [badHeader, `${oneRow},42`].join("\n");
    try {
      await collect(body);
      throw new Error("expected CsvHeaderError to be thrown");
    } catch (cause) {
      expect(cause).toBeInstanceOf(CsvHeaderError);
      if (cause instanceof CsvHeaderError) {
        expect(cause.unexpected).toEqual(["Extra"]);
        expect(cause.missing).toEqual([]);
      }
    }
  });

  it("rejects a renamed column with CsvHeaderError naming both sides of the diff", async () => {
    const badHeader = validHeader.replace("PatientId", "PatientID");
    const body = [badHeader, oneRow].join("\n");
    try {
      await collect(body);
      throw new Error("expected CsvHeaderError to be thrown");
    } catch (cause) {
      expect(cause).toBeInstanceOf(CsvHeaderError);
      if (cause instanceof CsvHeaderError) {
        expect(cause.missing).toContain("PatientId");
        expect(cause.unexpected).toContain("PatientID");
      }
    }
  });
});
