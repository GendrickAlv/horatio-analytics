# ADR-0003 — Streaming CSV ingestion with chunked transactions

**Status:** Accepted

## Context

The historical no-show CSV is ~110 k rows in the Kaggle distribution and
the brief notes that the API "must" accept it. Two pressures pull in
opposite directions:

- **Memory.** Loading 110 k rows + every dedup map into memory at once
  is wasteful and gets actively bad if the same endpoint ever sees a
  larger file (real operations data tends to grow).
- **Atomicity.** Wrapping the whole file in one transaction means a
  failure 100 k rows in rolls back everything; recovery has to start
  from scratch.

Candidates considered:

- **Load-all + single transaction.** Simple, but a single bad chunk or
  a transient DB hiccup blows away the whole load. Memory grows
  linearly with the file.
- **Row-by-row inserts.** Defeats the database — 110 k round-trips
  destroy throughput and bloat the WAL.
- **Streaming + chunked transactions (chosen).** `csv-parse` yields
  records as they are read; validated rows accumulate in a buffer; on
  reaching the chunk threshold the buffer is flushed inside its own
  transaction.

## Decision

The historical ingest pipeline:

1. Streams the upload through `csv-parse`.
2. Validates each record with `csvRowSchema` (Zod) and either appends
   it to the in-memory chunk or records a row-level diagnostic and
   skips.
3. When the chunk reaches `CHUNK_SIZE = 500` rows, opens a transaction,
   upserts neighbourhoods + patients, then inserts appointments, and
   commits.
4. Flushes the final partial chunk after the stream ends.

The batch endpoint uses a different pattern: the whole request runs in
one transaction because batches are small (≤ 1,000 rows) and atomicity
matters more there (a partial batch leaves the caller uncertain about
which rows landed).

## Consequences

- **+** Memory stays flat under load — only the active chunk and the
  per-chunk dedup maps live at once.
- **+** A transient DB failure costs at most one chunk (500 rows), not
  the whole file. The ingest summary still reports correctly because
  the surrounding loop tracks counts per chunk.
- **+** Throughput is bounded by SQL planning + WAL, not by network
  round-trips.
- **−** Two ingestion code paths (chunked stream vs. one-shot batch),
  but each is the natural shape for its endpoint.
- **−** No checkpointing across requests. A killed process loses the
  in-flight chunk's progress (re-running the upload is safe because
  appointments use `ON CONFLICT DO NOTHING` on the natural key). A
  larger-scale system would back this with an upload-state table.
