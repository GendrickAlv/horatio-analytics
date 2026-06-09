import { UploadCsv } from "./_components/upload-csv";
import {
  aboveAverageNoShows,
  noShowsByQuarter,
  type AboveAverageNoShowsRow,
  type NoShowsByQuarterRow,
} from "@/src/services/analytics.service";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";
// Always evaluate on request so the dashboard reflects the latest ingestion.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

// Run an analytics service and swallow DB errors so a missing/empty database
// degrades to "no data" instead of a 500 — the dashboard is the friendly face
// of the API, not a debugging surface.
async function safeQuery<T>(
  label: string,
  run: () => Promise<T[]>,
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const rows = await run();
    return { rows, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    logger.warn({ label, message }, "dashboard query failed");
    return { rows: [], error: message };
  }
}

function parseYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) {
    return undefined;
  }
  return parsed;
}

export default async function Home({ searchParams }: PageProps): Promise<React.ReactElement> {
  const { year: yearParam } = await searchParams;
  const year = parseYear(yearParam);

  const [quarter, average] = await Promise.all([
    safeQuery<NoShowsByQuarterRow>("no-shows-by-quarter", () =>
      noShowsByQuarter(year),
    ),
    safeQuery<AboveAverageNoShowsRow>("above-average-no-shows", () =>
      aboveAverageNoShows(year),
    ),
  ]);

  const dbUnreachable = quarter.error !== null && average.error !== null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Horatio Analytics — Data Quality Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Healthcare appointment no-shows by neighbourhood, gender and
            quarter. Upload the historical CSV to populate the dataset; invalid
            rows are reported with diagnostics.
          </p>
        </div>
        <YearForm currentYear={year} />
      </header>

      {dbUnreachable && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Database is not reachable. Start it with{" "}
          <code className="font-mono">docker compose up -d postgres</code>,
          apply migrations (<code className="font-mono">npm run db:migrate</code>),
          and reload.
        </div>
      )}

      <UploadCsv />

      <AnalyticsSection
        title="No-shows by neighbourhood, gender and quarter"
        subtitle={
          year !== undefined
            ? `Year ${year}.`
            : "Defaults to the latest calendar year present in appointments."
        }
        error={quarter.error}
      >
        <QuarterTable rows={quarter.rows} />
      </AnalyticsSection>

      <AnalyticsSection
        title="Neighbourhoods above the mean no-show count"
        subtitle="Neighbourhoods whose no-show total exceeds the average across all neighbourhoods for the selected year."
        error={average.error}
      >
        <AverageTable rows={average.rows} />
      </AnalyticsSection>

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        OpenAPI spec at{" "}
        <a href="/api/openapi" className="underline">
          /api/openapi
        </a>
        . Health probe at{" "}
        <a href="/api/health" className="underline">
          /api/health
        </a>
        .
      </footer>
    </div>
  );
}

function YearForm({ currentYear }: { currentYear: number | undefined }): React.ReactElement {
  return (
    <form
      method="get"
      action="/"
      className="flex items-end gap-2 text-sm"
    >
      <label className="flex flex-col text-zinc-600 dark:text-zinc-400">
        <span className="text-xs uppercase tracking-wide">Year</span>
        <input
          name="year"
          type="number"
          min={1900}
          max={2200}
          defaultValue={currentYear ?? ""}
          placeholder="auto"
          className="mt-1 w-28 rounded-md border border-zinc-300 px-2 py-1 font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Apply
      </button>
    </form>
  );
}

function AnalyticsSection({
  title,
  subtitle,
  error,
  children,
}: {
  title: string;
  subtitle: string;
  error: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </header>
      {error !== null ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          Query failed: {error}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function QuarterTable({
  rows,
}: {
  rows: NoShowsByQuarterRow[];
}): React.ReactElement {
  if (rows.length === 0) {
    return (
      <EmptyState message="No no-show data for the selected year yet." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Neighbourhood</th>
            <th className="px-3 py-2 font-medium">Gender</th>
            <th className="px-3 py-2 text-right font-medium">Q1</th>
            <th className="px-3 py-2 text-right font-medium">Q2</th>
            <th className="px-3 py-2 text-right font-medium">Q3</th>
            <th className="px-3 py-2 text-right font-medium">Q4</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.neighbourhood}-${row.gender}-${i}`}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className="px-3 py-1.5">{row.neighbourhood}</td>
              <td className="px-3 py-1.5">{row.gender}</td>
              <td className="px-3 py-1.5 text-right font-mono">{row.Q1}</td>
              <td className="px-3 py-1.5 text-right font-mono">{row.Q2}</td>
              <td className="px-3 py-1.5 text-right font-mono">{row.Q3}</td>
              <td className="px-3 py-1.5 text-right font-mono">{row.Q4}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AverageTable({
  rows,
}: {
  rows: AboveAverageNoShowsRow[];
}): React.ReactElement {
  if (rows.length === 0) {
    return (
      <EmptyState message="No neighbourhoods above the mean for the selected year." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Neighbourhood</th>
            <th className="px-3 py-2 text-right font-medium">No-shows</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className="px-3 py-1.5 font-mono text-zinc-500">{row.id}</td>
              <td className="px-3 py-1.5">{row.neighbourhood}</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {row.no_shows.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {message}
    </p>
  );
}
