import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildAjv,
  compileResponseValidator,
  formatErrors,
  registerComponents,
} from "./contract-helpers";

// Contract tests run a real ingest + analytics cycle through the service
// layer and validate the response shape against the OpenAPI spec. Any drift
// between code and spec fails here. Database-gated for the same reason as
// the integration suite.
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("endpoint responses match the OpenAPI spec", () => {
  let db: typeof import("@/src/db/client")["db"];
  let ingestHistoricalCsv: typeof import("@/src/services/ingestion.service")["ingestHistoricalCsv"];
  let ingestBatch: typeof import("@/src/services/ingestion.service")["ingestBatch"];
  let noShowsByQuarter: typeof import("@/src/services/analytics.service")["noShowsByQuarter"];
  let aboveAverageNoShows: typeof import("@/src/services/analytics.service")["aboveAverageNoShows"];

  const ajv = buildAjv();
  registerComponents(ajv);

  beforeAll(async () => {
    ({ db } = await import("@/src/db/client"));
    ({ ingestHistoricalCsv, ingestBatch } = await import(
      "@/src/services/ingestion.service"
    ));
    ({ noShowsByQuarter, aboveAverageNoShows } = await import(
      "@/src/services/analytics.service"
    ));
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE appointments, neighbourhoods, patients RESTART IDENTITY CASCADE`,
    );
  });

  function csvStream(body: string): ReadableStream<Uint8Array> {
    const node = Readable.from([Buffer.from(body, "utf8")]);
    return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
  }

  const header =
    "PatientId,AppointmentID,Gender,ScheduledDay,AppointmentDay,Age,Neighbourhood,Scholarship,Hipertension,Diabetes,Alcoholism,Handcap,SMS_received,No-show";
  const validRow =
    "1,10,F,2016-04-01T10:00:00Z,2016-04-02T00:00:00Z,30,CENTRO,0,0,0,0,0,0,Yes";
  const invalidRow =
    "2,11,X,2016-04-01T10:00:00Z,2016-04-02T00:00:00Z,30,CENTRO,0,0,0,0,0,0,No";

  async function seedOneRow(): Promise<void> {
    await ingestHistoricalCsv(csvStream([header, validRow].join("\n")));
  }

  it("POST /api/ingest/historical 200", async () => {
    const validate = compileResponseValidator(ajv, {
      path: "/api/ingest/historical",
      method: "post",
      status: "200",
    });
    const result = await ingestHistoricalCsv(
      csvStream([header, validRow, invalidRow].join("\n")),
    );
    expect(validate(result), formatErrors(validate)).toBe(true);
  });

  it("POST /api/appointments/batch 200", async () => {
    await seedOneRow(); // ensure patient_id 1 exists for the batch insert
    const validate = compileResponseValidator(ajv, {
      path: "/api/appointments/batch",
      method: "post",
      status: "200",
    });
    const result = await ingestBatch({
      appointments: [
        {
          appointment_id: 9999,
          patient_id: 1,
          neighbourhood: "CENTRO",
          // Already-transformed values: the service receives parsed input.
          scheduled_at: new Date("2016-05-01T10:00:00Z"),
          appointment_at: new Date("2016-05-02T00:00:00Z"),
          sms_received: false,
          no_show: true,
        },
      ],
    });
    expect(validate(result), formatErrors(validate)).toBe(true);
  });

  it("GET /api/analytics/no-shows-by-quarter 200", async () => {
    await seedOneRow();
    const validate = compileResponseValidator(ajv, {
      path: "/api/analytics/no-shows-by-quarter",
      method: "get",
      status: "200",
    });
    const rows = await noShowsByQuarter(2016);
    expect(validate(rows), formatErrors(validate)).toBe(true);
  });

  it("GET /api/analytics/above-average-no-shows 200", async () => {
    await seedOneRow();
    const validate = compileResponseValidator(ajv, {
      path: "/api/analytics/above-average-no-shows",
      method: "get",
      status: "200",
    });
    const rows = await aboveAverageNoShows(2016);
    expect(validate(rows), formatErrors(validate)).toBe(true);
  });

  it("returns empty arrays from analytics on an empty database", async () => {
    // TRUNCATE just ran, so no data. Both analytics responses must still match.
    const quarter = compileResponseValidator(ajv, {
      path: "/api/analytics/no-shows-by-quarter",
      method: "get",
      status: "200",
    });
    const avg = compileResponseValidator(ajv, {
      path: "/api/analytics/above-average-no-shows",
      method: "get",
      status: "200",
    });
    expect(quarter(await noShowsByQuarter(2016))).toBe(true);
    expect(avg(await aboveAverageNoShows(2016))).toBe(true);
  });
});

// Health and OpenAPI are DB-free so they always run.
describe("DB-free endpoints", () => {
  const ajv = buildAjv();
  registerComponents(ajv);

  it("GET /api/health response shape", () => {
    const validate = compileResponseValidator(ajv, {
      path: "/api/health",
      method: "get",
      status: "200",
    });
    expect(validate({ status: "ok" }), formatErrors(validate)).toBe(true);
    // Wrong literal must fail.
    expect(validate({ status: "not-ok" })).toBe(false);
  });
});
