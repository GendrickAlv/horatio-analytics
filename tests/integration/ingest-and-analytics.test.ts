import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// Integration tests are gated on a live Postgres. CI provides one via a service
// container; local runs need `docker-compose up -d` and a fresh migration. If
// DATABASE_URL is missing we silently skip rather than fail — keeps `npm test`
// runnable on a laptop without Docker.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("historical ingest + analytics (integration)", () => {
  let db: typeof import("@/src/db/client")["db"];
  let ingestHistoricalCsv: typeof import("@/src/services/ingestion.service")["ingestHistoricalCsv"];
  let noShowsByQuarter: typeof import("@/src/services/analytics.service")["noShowsByQuarter"];
  let aboveAverageNoShows: typeof import("@/src/services/analytics.service")["aboveAverageNoShows"];

  beforeAll(async () => {
    // Lazy import so the module never tries to connect when DB is absent.
    ({ db } = await import("@/src/db/client"));
    ({ ingestHistoricalCsv } = await import(
      "@/src/services/ingestion.service"
    ));
    ({ noShowsByQuarter, aboveAverageNoShows } = await import(
      "@/src/services/analytics.service"
    ));
  });

  beforeEach(async () => {
    // Order matters: child tables first.
    await db.execute(
      sql`TRUNCATE appointments, neighbourhoods, patients RESTART IDENTITY CASCADE`,
    );
  });

  function csvStream(body: string): ReadableStream<Uint8Array> {
    const node = Readable.from([Buffer.from(body, "utf8")]);
    // Cast: Node Readable.toWeb returns a Web ReadableStream.
    return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
  }

  const header =
    "PatientId,AppointmentID,Gender,ScheduledDay,AppointmentDay,Age,Neighbourhood,Scholarship,Hipertension,Diabetes,Alcoholism,Handcap,SMS_received,No-show";

  it("ingests a small CSV with one bad row and reports diagnostics", async () => {
    const body = [
      header,
      // 3 valid rows across two neighbourhoods, two genders.
      "1,10,F,2016-04-01T10:00:00Z,2016-04-02T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes",
      "2,11,M,2016-05-01T10:00:00Z,2016-05-02T00:00:00Z,40,CENTRO,0,0,0,0,0,0,No",
      "3,12,F,2016-07-01T10:00:00Z,2016-07-02T00:00:00Z,50,NORTE,0,0,0,0,0,0,Yes",
      // 1 invalid row (Gender = X).
      "4,13,X,2016-08-01T10:00:00Z,2016-08-02T00:00:00Z,20,NORTE,0,0,0,0,0,0,No",
    ].join("\n");

    const result = await ingestHistoricalCsv(csvStream(body));
    expect(result.summary).toEqual({ received: 4, inserted: 3, skipped: 1 });
    expect(result.truncated).toBe(false);
    expect(
      result.diagnostics.some((d) => d.field === "Gender"),
    ).toBe(true);
  });

  it("computes no-shows by quarter pivot correctly", async () => {
    const body = [
      header,
      // CENTRO/F: 2 no-shows in Q1, 1 no-show in Q3
      "1,1,F,2016-01-10T00:00:00Z,2016-01-15T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes",
      "1,2,F,2016-02-10T00:00:00Z,2016-02-15T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes",
      "1,3,F,2016-07-10T00:00:00Z,2016-07-15T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes",
      // CENTRO/F attended (no_show=false) — excluded
      "1,4,F,2016-04-10T00:00:00Z,2016-04-15T00:00:00Z,30,CENTRO,0,0,0,0,0,0,No",
      // NORTE/M: 1 no-show in Q4
      "2,5,M,2016-10-10T00:00:00Z,2016-10-15T00:00:00Z,40,NORTE,0,0,0,0,0,0,Yes",
    ].join("\n");
    await ingestHistoricalCsv(csvStream(body));

    const rows = await noShowsByQuarter(2016);
    expect(rows).toEqual([
      { neighbourhood: "CENTRO", gender: "F", Q1: 2, Q2: 0, Q3: 1, Q4: 0 },
      { neighbourhood: "NORTE", gender: "M", Q1: 0, Q2: 0, Q3: 0, Q4: 1 },
    ]);
  });

  it("is idempotent on appointment_id: re-ingesting the same CSV inserts zero new rows", async () => {
    const body = [
      header,
      "1,10,F,2016-04-01T10:00:00Z,2016-04-02T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes",
      "2,11,M,2016-05-01T10:00:00Z,2016-05-02T00:00:00Z,40,CENTRO,0,0,0,0,0,0,No",
      "3,12,F,2016-07-01T10:00:00Z,2016-07-02T00:00:00Z,50,NORTE,0,0,0,0,0,0,Yes",
    ].join("\n");

    const first = await ingestHistoricalCsv(csvStream(body));
    expect(first.summary).toEqual({ received: 3, inserted: 3, skipped: 0 });
    expect(first.diagnostics).toEqual([]);

    // Re-submit the exact same body. Every row already exists; no new
    // diagnostics; insert count drops to zero. This is the contract we
    // document under §4 Idempotency.
    const second = await ingestHistoricalCsv(csvStream(body));
    expect(second.summary).toEqual({ received: 3, inserted: 0, skipped: 0 });
    expect(second.diagnostics).toEqual([]);
  });

  it("returns only above-average neighbourhoods", async () => {
    // Counts per neighbourhood:
    //   CENTRO: 3 no-shows
    //   NORTE:  1 no-show
    //   SUR:    8 no-shows
    // Average = (3 + 1 + 8) / 3 = 4 → only SUR exceeds the mean.
    const rows: string[] = [header];
    let appt = 100;
    const noShow = (patientId: number, hood: string, month: number) =>
      `${patientId},${appt++},F,2016-${String(month).padStart(2, "0")}-01T00:00:00Z,2016-${String(month).padStart(2, "0")}-02T00:00:00Z,30,${hood},0,0,0,0,0,0,Yes`;
    for (let i = 0; i < 3; i += 1) rows.push(noShow(1, "CENTRO", 1 + i));
    rows.push(noShow(2, "NORTE", 6));
    for (let i = 0; i < 8; i += 1) rows.push(noShow(3, "SUR", 1 + (i % 12)));
    await ingestHistoricalCsv(csvStream(rows.join("\n")));

    const result = await aboveAverageNoShows(2016);
    expect(result).toHaveLength(1);
    expect(result[0]?.neighbourhood).toBe("SUR");
    expect(result[0]?.no_shows).toBe(8);
  });
});
