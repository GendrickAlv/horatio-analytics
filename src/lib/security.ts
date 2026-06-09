// Defensive request-size limits for the ingestion endpoints. The values are
// generous on purpose — the real Kaggle CSV is ~10 MB and a maximal 1,000-row
// batch is under 1 MB — but they cap unbounded growth from a malicious or
// misbehaving client. We rely on the `Content-Length` header advertised by
// the caller; a missing header lets the request through and falls back to
// the runtime stream limits (Next.js + the CSV parser). This is acceptable
// in a synthetic-data take-home; a production deployment would also enforce
// the limit during streaming.

// 200 MB. Twenty times larger than the real Kaggle file; small enough to
// reject obvious abuse.
export const MAX_HISTORICAL_BYTES = 200 * 1024 * 1024;

// 5 MB. A maxed-out batch (1,000 rows × ~500 bytes of JSON) is well under
// 1 MB; 5 MB allows generous diagnostic strings without inviting abuse.
export const MAX_BATCH_BYTES = 5 * 1024 * 1024;

export interface SizeCheckOk {
  ok: true;
}

export interface SizeCheckRejection {
  ok: false;
  status: 400 | 413;
  error: string;
}

export type SizeCheck = SizeCheckOk | SizeCheckRejection;

// Inspect the advertised `Content-Length` and decide whether to accept the
// request. Returns `{ ok: true }` if the header is missing — callers must
// document their best-effort guarantee in that case.
export function checkBodySize(request: Request, limitBytes: number): SizeCheck {
  const raw = request.headers.get("content-length");
  if (raw === null) return { ok: true };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid Content-Length header",
    };
  }
  if (parsed > limitBytes) {
    return {
      ok: false,
      status: 413,
      error: `Payload too large; maximum is ${limitBytes} bytes`,
    };
  }
  return { ok: true };
}
