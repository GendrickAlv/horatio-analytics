# ADR-0004 — Best-effort ingestion with row-level diagnostics

**Status:** Accepted

## Context

The brief's Data Governance criterion (20 % of the score) calls for
"edge validation, handling of dirty rows, transactional integrity,
**row-level diagnostics surfaced via the API**". The dataset is known
to ship with typos (`Hipertension`), nonsense values, and rows that
violate logical invariants (`ScheduledDay` after `AppointmentDay`).

The design question is: when ingest encounters a bad row, what do we
do?

Candidates considered:

- **Strict all-or-nothing.** Easy to reason about, terrible UX — one
  bad row in a 110 k-row file rejects the whole load. The operations
  team has no idea which row, has no way to repair iteratively, and
  has to fix the source before retrying.
- **Best-effort, silent skip.** Loads everything that parses, hides
  the rest. Insidious — the database fills up with "successful" loads
  that are actually missing rows the caller never hears about.
- **Best-effort + row-level diagnostics (chosen).** Valid rows are
  persisted. Each invalid row contributes a structured
  `{ row, field, value, error }` entry to the response. The caller
  sees exactly what was lost and why.

## Decision

Both ingest endpoints (`POST /api/ingest/historical` and
`POST /api/appointments/batch`) follow the same contract:

```jsonc
{
  "summary": { "received": N, "inserted": M, "skipped": K },
  "diagnostics": [
    { "row": 153, "field": "Gender", "value": "X", "error": "must be 'M' or 'F'" }
  ],
  "truncated": false
}
```

`diagnostics` is capped at the first **1,000** entries with a
`"truncated": true` flag once the cap is hit — bounded memory, full
fidelity for the common case.

The same diagnostic shape is exported under `components.schemas.Diagnostic`
in the OpenAPI document, so clients consume one type for both endpoints.

## Consequences

- **+** Operations teams can ingest a noisy file, get back exactly
  which rows failed and why, repair them, and re-ingest. Iteration is
  cheap.
- **+** The contract is the same between historical and batch
  endpoints, so client code doesn't fork.
- **+** Validation lives in Zod schemas; the schema doubles as the
  source of error messages, so a new validation rule produces a
  diagnostic without separate plumbing.
- **−** Callers must inspect `summary.skipped` — a 200 response no
  longer guarantees full success. The dashboard surfaces this
  prominently to make the skip count visible.
- **−** Memory bound (1,000 diagnostics) means catastrophic CSVs lose
  the long tail of errors. The summary count remains accurate; the
  detail does not. A production version would stream diagnostics to a
  side channel (file, queue, S3).
