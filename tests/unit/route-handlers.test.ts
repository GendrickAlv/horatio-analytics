import { beforeAll, describe, expect, it } from "vitest";

// Route handlers transitively import the DB client which throws on import
// without a connection string. Set a placeholder so the modules load — we
// only exercise paths that return before the first query.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/test";

interface ErrorBody {
  error: string;
  diagnostics?: unknown[];
}

describe("POST /api/ingest/historical — HTTP boundary", () => {
  let POST: (request: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/ingest/historical/route"));
  });

  it("rejects non-multipart Content-Type with 400", async () => {
    const res = await POST(
      new Request("http://test/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorBody;
    expect(json.error.toLowerCase()).toContain("multipart");
  });

  it("rejects an oversized Content-Length with 413", async () => {
    const res = await POST(
      new Request("http://test/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=x",
          // 300 MB > 200 MB cap.
          "Content-Length": String(300 * 1024 * 1024),
        },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects garbage Content-Length with 400", async () => {
    const res = await POST(
      new Request("http://test/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=x",
          "Content-Length": "abc",
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/appointments/batch — HTTP boundary", () => {
  let POST: (request: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/appointments/batch/route"));
  });

  it("rejects an oversized Content-Length with 413", async () => {
    const res = await POST(
      new Request("http://test/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(10 * 1024 * 1024),
        },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(
      new Request("http://test/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not valid json",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorBody;
    expect(json.error.toLowerCase()).toContain("json");
  });

  it("rejects an empty appointments array with 400 + diagnostics", async () => {
    const res = await POST(
      new Request("http://test/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointments: [] }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorBody;
    expect(json.diagnostics).toBeDefined();
    expect(Array.isArray(json.diagnostics)).toBe(true);
  });

  it("rejects a 1001-row batch with 400 + diagnostics", async () => {
    const oneRow = {
      appointment_id: 1,
      patient_id: 100,
      neighbourhood: "CENTRO",
      scheduled_at: "2016-04-01T10:00:00Z",
      appointment_at: "2016-04-02T00:00:00Z",
      sms_received: 0,
      no_show: "No" as const,
    };
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      ...oneRow,
      appointment_id: i + 1,
    }));
    const res = await POST(
      new Request("http://test/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointments: rows }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
