import { describe, expect, it } from "vitest";
import {
  MAX_BATCH_BYTES,
  MAX_HISTORICAL_BYTES,
  checkBodySize,
} from "@/src/lib/security";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://test.local/", { method: "POST", headers });
}

describe("checkBodySize", () => {
  it("accepts a request without Content-Length (caller best-effort)", () => {
    expect(checkBodySize(requestWith({}), MAX_BATCH_BYTES)).toEqual({
      ok: true,
    });
  });

  it("accepts a request well under the limit", () => {
    expect(
      checkBodySize(requestWith({ "content-length": "1024" }), MAX_BATCH_BYTES),
    ).toEqual({ ok: true });
  });

  it("accepts a request exactly at the limit", () => {
    expect(
      checkBodySize(
        requestWith({ "content-length": String(MAX_BATCH_BYTES) }),
        MAX_BATCH_BYTES,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a request one byte over the limit with 413", () => {
    const result = checkBodySize(
      requestWith({ "content-length": String(MAX_BATCH_BYTES + 1) }),
      MAX_BATCH_BYTES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it("rejects garbage Content-Length with 400", () => {
    const result = checkBodySize(
      requestWith({ "content-length": "not-a-number" }),
      MAX_BATCH_BYTES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects negative Content-Length with 400", () => {
    const result = checkBodySize(
      requestWith({ "content-length": "-1" }),
      MAX_BATCH_BYTES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects fractional Content-Length with 400", () => {
    const result = checkBodySize(
      requestWith({ "content-length": "1.5" }),
      MAX_BATCH_BYTES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("uses distinct limits for historical and batch endpoints", () => {
    expect(MAX_HISTORICAL_BYTES).toBeGreaterThan(MAX_BATCH_BYTES);
  });
});
