"use client";

import { useState, type FormEvent } from "react";

interface Diagnostic {
  row: number;
  field?: string;
  value?: unknown;
  error: string;
}

interface HistoricalResponse {
  summary: { received: number; inserted: number; skipped: number };
  diagnostics: Diagnostic[];
  truncated: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "ok"; result: HistoricalResponse }
  | { kind: "error"; message: string };

// Renders a small subset of diagnostics to keep the page legible even when the
// API returns up to 1000 rows. Full payload is always available via the API.
const DIAGNOSTIC_DISPLAY_LIMIT = 25;

export function UploadCsv(): React.ReactElement {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus({ kind: "error", message: "Pick a CSV file first." });
      return;
    }

    setStatus({ kind: "uploading" });
    try {
      const response = await fetch("/api/ingest/historical", {
        method: "POST",
        body: data,
      });
      const json = (await response.json()) as
        | HistoricalResponse
        | { error: string };
      if (!response.ok) {
        const message =
          "error" in json ? json.error : `Upload failed (HTTP ${response.status}).`;
        setStatus({ kind: "error", message });
        return;
      }
      setStatus({ kind: "ok", result: json as HistoricalResponse });
      // Keep the form selected so the user can iterate on the same file.
    } catch (cause) {
      setStatus({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Network error",
      });
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Historical ingestion
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload the Kaggle CSV. Valid rows are persisted; invalid rows are
          skipped and surfaced as row-level diagnostics.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full max-w-md text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
        <button
          type="submit"
          disabled={status.kind === "uploading"}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {status.kind === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </form>

      {status.kind === "error" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {status.message}
        </p>
      )}

      {status.kind === "ok" && (
        <div className="mt-6 space-y-4">
          <SummaryCards summary={status.result.summary} />
          <DiagnosticsTable
            diagnostics={status.result.diagnostics}
            truncated={status.result.truncated}
          />
        </div>
      )}
    </section>
  );
}

function SummaryCards({
  summary,
}: {
  summary: HistoricalResponse["summary"];
}): React.ReactElement {
  return (
    <dl className="grid grid-cols-3 gap-3 text-sm">
      <SummaryStat label="Received" value={summary.received} />
      <SummaryStat label="Inserted" value={summary.inserted} tone="ok" />
      <SummaryStat label="Skipped" value={summary.skipped} tone="warn" />
    </dl>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}): React.ReactElement {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function DiagnosticsTable({
  diagnostics,
  truncated,
}: {
  diagnostics: Diagnostic[];
  truncated: boolean;
}): React.ReactElement {
  if (diagnostics.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No invalid rows. ✓
      </p>
    );
  }

  const visible = diagnostics.slice(0, DIAGNOSTIC_DISPLAY_LIMIT);
  const hidden = diagnostics.length - visible.length;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Diagnostics
      </h3>
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Row</th>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d, i) => (
              <tr
                key={`${d.row}-${d.field ?? "row"}-${i}`}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-1.5 font-mono text-zinc-600 dark:text-zinc-400">
                  {d.row}
                </td>
                <td className="px-3 py-1.5">{d.field ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                  {d.value === undefined || d.value === null
                    ? "—"
                    : String(d.value)}
                </td>
                <td className="px-3 py-1.5 text-red-700 dark:text-red-400">
                  {d.error}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(hidden > 0 || truncated) && (
        <p className="mt-2 text-xs text-zinc-500">
          {hidden > 0 &&
            `Showing first ${visible.length} of ${diagnostics.length} diagnostics. `}
          {truncated &&
            "The API truncated diagnostics to the first 1000 entries."}
        </p>
      )}
    </div>
  );
}
