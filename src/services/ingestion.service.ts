import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  appointments as appointmentsTable,
  neighbourhoods as neighbourhoodsTable,
  patients as patientsTable,
  type NewAppointment,
  type NewPatient,
} from "../db/schema";
import { streamCsvRecords } from "../lib/csv";
import {
  DiagnosticsCollector,
  type DiagnosticsReport,
} from "../lib/diagnostics";
import {
  csvRowToAppointment,
  csvRowToPatient,
  zodIssuesToDiagnostics,
} from "../lib/mappers";
import { csvRowSchema, type ParsedCsvRow } from "../lib/validation";

const CHUNK_SIZE = 500;
const DIAGNOSTIC_LIMIT = 1000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface HistoricalSummary {
  received: number;
  inserted: number;
  skipped: number;
}

export interface HistoricalResult extends DiagnosticsReport {
  summary: HistoricalSummary;
}

// Resolve a batch of neighbourhood names to surrogate IDs, inserting any new
// ones in a single round-trip. The second SELECT is needed because the source
// row may already exist (ON CONFLICT DO NOTHING returns nothing for it).
async function upsertNeighbourhoods(
  tx: Tx,
  names: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();

  await tx
    .insert(neighbourhoodsTable)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing({ target: neighbourhoodsTable.name });

  const rows = await tx
    .select({
      id: neighbourhoodsTable.neighbourhoodId,
      name: neighbourhoodsTable.name,
    })
    .from(neighbourhoodsTable)
    .where(inArray(neighbourhoodsTable.name, unique));

  return new Map(rows.map((r) => [r.name, r.id]));
}

// First-row-wins per patient — the CSV repeats every demographic field on every
// appointment, but the brief says to derive year_of_birth from a single
// representative row.
async function upsertPatients(
  tx: Tx,
  patients: readonly NewPatient[],
): Promise<void> {
  if (patients.length === 0) return;
  const dedup = new Map<number, NewPatient>();
  for (const p of patients) {
    if (!dedup.has(p.patientId)) dedup.set(p.patientId, p);
  }
  await tx
    .insert(patientsTable)
    .values([...dedup.values()])
    .onConflictDoNothing({ target: patientsTable.patientId });
}

async function insertAppointments(
  tx: Tx,
  rows: readonly NewAppointment[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const dedup = new Map<number, NewAppointment>();
  for (const a of rows) dedup.set(a.appointmentId, a);
  const inserted = await tx
    .insert(appointmentsTable)
    .values([...dedup.values()])
    .onConflictDoNothing({ target: appointmentsTable.appointmentId })
    .returning({ id: appointmentsTable.appointmentId });
  return inserted.length;
}

async function flushChunk(rows: readonly ParsedCsvRow[]): Promise<number> {
  return db.transaction(async (tx) => {
    const neighbourhoodMap = await upsertNeighbourhoods(
      tx,
      rows.map((r) => r.Neighbourhood),
    );
    await upsertPatients(tx, rows.map(csvRowToPatient));

    const appointmentsToInsert: NewAppointment[] = [];
    for (const row of rows) {
      const neighbourhoodId = neighbourhoodMap.get(row.Neighbourhood);
      if (neighbourhoodId === undefined) {
        // Defensive: upsert above guarantees presence, but bail rather than
        // crashing the whole chunk if the contract ever drifts.
        continue;
      }
      appointmentsToInsert.push(csvRowToAppointment(row, neighbourhoodId));
    }
    return insertAppointments(tx, appointmentsToInsert);
  });
}

export async function ingestHistoricalCsv(
  source: ReadableStream<Uint8Array>,
): Promise<HistoricalResult> {
  const diagnostics = new DiagnosticsCollector(DIAGNOSTIC_LIMIT);
  let received = 0;
  let inserted = 0;
  let skipped = 0;
  let chunk: ParsedCsvRow[] = [];

  for await (const { row, record } of streamCsvRecords(source)) {
    received += 1;
    const result = csvRowSchema.safeParse(record);
    if (!result.success) {
      diagnostics.addMany(zodIssuesToDiagnostics(row, result.error, record));
      skipped += 1;
      continue;
    }
    chunk.push(result.data);
    if (chunk.length >= CHUNK_SIZE) {
      inserted += await flushChunk(chunk);
      chunk = [];
    }
  }
  if (chunk.length > 0) {
    inserted += await flushChunk(chunk);
  }

  return {
    summary: { received, inserted, skipped },
    ...diagnostics.report(),
  };
}

