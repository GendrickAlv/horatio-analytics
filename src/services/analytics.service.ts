import { sql } from "drizzle-orm";
import { db } from "../db/client";

// "Default year" rule (documented in README): the latest calendar year that
// has at least one row in `appointments`. NULL when the fact table is empty.
async function resolveYear(year: number | undefined): Promise<number | null> {
  if (year !== undefined) return year;
  const result = await db.execute<{ year: number | null }>(sql`
    SELECT EXTRACT(YEAR FROM MAX(appointment_at))::int AS year
    FROM appointments
  `);
  return result[0]?.year ?? null;
}

export interface NoShowsByQuarterRow {
  neighbourhood: string;
  gender: "M" | "F";
  Q1: number;
  Q2: number;
  Q3: number;
  Q4: number;
}

// Requirement 4.1: no-show counts by neighbourhood × gender, pivoted into one
// column per quarter using conditional aggregation (FILTER). Only rows with at
// least one no-show in the year appear — pairs with zero no-shows would all be
// zero anyway and aren't meaningful here.
export async function noShowsByQuarter(
  year: number | undefined,
): Promise<NoShowsByQuarterRow[]> {
  const targetYear = await resolveYear(year);
  if (targetYear === null) return [];

  const rows = await db.execute<{
    neighbourhood: string;
    gender: "M" | "F";
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  }>(sql`
    SELECT
      n.name AS neighbourhood,
      p.gender AS gender,
      COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM a.appointment_at) = 1) AS q1,
      COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM a.appointment_at) = 2) AS q2,
      COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM a.appointment_at) = 3) AS q3,
      COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM a.appointment_at) = 4) AS q4
    FROM appointments a
    JOIN neighbourhoods n ON n.neighbourhood_id = a.neighbourhood_id
    JOIN patients p ON p.patient_id = a.patient_id
    WHERE a.no_show = true
      AND EXTRACT(YEAR FROM a.appointment_at) = ${targetYear}
    GROUP BY n.name, p.gender
    ORDER BY n.name ASC, p.gender ASC
  `);

  // postgres returns COUNT(*) as a string (bigint). Coerce to JS number.
  return rows.map((r) => ({
    neighbourhood: r.neighbourhood,
    gender: r.gender,
    Q1: Number(r.q1),
    Q2: Number(r.q2),
    Q3: Number(r.q3),
    Q4: Number(r.q4),
  }));
}

export interface AboveAverageNoShowsRow {
  id: number;
  neighbourhood: string;
  no_shows: number;
}

// Requirement 4.2: neighbourhoods whose no-show count exceeds the mean across
// all neighbourhoods for the given year. The CTE computes the per-neighbourhood
// totals once; the subquery reuses them to compute the threshold (avoids a
// second pass over `appointments`).
export async function aboveAverageNoShows(
  year: number | undefined,
): Promise<AboveAverageNoShowsRow[]> {
  const targetYear = await resolveYear(year);
  if (targetYear === null) return [];

  const rows = await db.execute<{
    id: number;
    neighbourhood: string;
    no_shows: string;
  }>(sql`
    WITH per_neighbourhood AS (
      SELECT
        n.neighbourhood_id AS id,
        n.name AS neighbourhood,
        COUNT(*) AS no_shows
      FROM appointments a
      JOIN neighbourhoods n ON n.neighbourhood_id = a.neighbourhood_id
      WHERE a.no_show = true
        AND EXTRACT(YEAR FROM a.appointment_at) = ${targetYear}
      GROUP BY n.neighbourhood_id, n.name
    )
    SELECT id, neighbourhood, no_shows
    FROM per_neighbourhood
    WHERE no_shows > (SELECT AVG(no_shows) FROM per_neighbourhood)
    ORDER BY no_shows DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    neighbourhood: r.neighbourhood,
    no_shows: Number(r.no_shows),
  }));
}
