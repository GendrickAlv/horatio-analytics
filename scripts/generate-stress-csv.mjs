#!/usr/bin/env node
// Generates a synthetic CSV that matches the Kaggle medical-appointment
// schema, with realistic-ish distributions and a sprinkle of intentionally
// invalid rows so the diagnostics path lights up.
//
// Usage:
//   node scripts/generate-stress-csv.mjs [rowCount] [outputPath]
//   node scripts/generate-stress-csv.mjs 10000 data/large.csv

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const rowCount = Number(process.argv[2] ?? 10_000);
const outputPath = resolve(
  process.cwd(),
  process.argv[3] ?? "data/large.csv",
);

const NEIGHBOURHOODS = [
  "JARDIM DA PENHA", "JARDIM CAMBURI", "MARIA ORTIZ", "RESISTENCIA",
  "CENTRO", "ITARARE", "BENTO FERREIRA", "GURIGICA",
  "SANTA MARTHA", "SAO PEDRO", "ROMAO", "SOLON BORGES",
  "ANDORINHAS", "CARATOIRA", "SANTO ANTONIO", "ILHA DO PRINCIPE",
  "SANTA TEREZA", "NOVA PALESTINA", "BONFIM", "PRAIA DO CANTO",
];

const HEADER = [
  "PatientId", "AppointmentID", "Gender", "ScheduledDay", "AppointmentDay",
  "Age", "Neighbourhood", "Scholarship", "Hipertension", "Diabetes",
  "Alcoholism", "Handcap", "SMS_received", "No-show",
].join(",");

// Cheap deterministic-ish PRNG so re-runs are reproducible. Mulberry32.
function rng(seed = 1337) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng();
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const flip = (probability) => (random() < probability ? "1" : "0");

// A modest pool of recurring patients so dedup actually exercises (the brief
// expects the loader to dedupe patients into the patients table).
const PATIENT_POOL_SIZE = Math.max(50, Math.floor(rowCount / 8));
const patientPool = Array.from({ length: PATIENT_POOL_SIZE }, (_, i) => ({
  id: 1_000_000_000_000 + i * 7919,
  gender: random() < 0.65 ? "F" : "M",
  age: Math.floor(random() * 95),
}));

function randomDateInYear(year) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31, 23, 59, 59);
  const ts = start + Math.floor(random() * (end - start));
  return new Date(ts);
}

// Format YYYY-MM-DDTHH:MM:SSZ (no milliseconds — matches the source style).
function iso(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function* generateRows() {
  let appointmentId = 5_000_000;
  for (let i = 0; i < rowCount; i++) {
    const patient = pick(patientPool);
    const appointmentDay = randomDateInYear(2016);
    // ScheduledDay is on or before AppointmentDay — pull from up to 60 days
    // earlier so the validator's date invariant gets a thorough workout.
    const offsetDays = Math.floor(random() * 60);
    const scheduledDay = new Date(
      appointmentDay.getTime() - offsetDays * 86_400_000 +
        Math.floor(random() * 86_400_000),
    );
    // Truncate scheduled to be at most the appointment date itself.
    const scheduledClamped =
      scheduledDay > appointmentDay
        ? new Date(appointmentDay.getTime())
        : scheduledDay;

    yield [
      patient.id,
      appointmentId++,
      patient.gender,
      iso(scheduledClamped),
      iso(new Date(Date.UTC(
        appointmentDay.getUTCFullYear(),
        appointmentDay.getUTCMonth(),
        appointmentDay.getUTCDate(),
      ))),
      patient.age,
      pick(NEIGHBOURHOODS),
      flip(0.10),
      flip(0.20),
      flip(0.07),
      flip(0.03),
      Math.floor(random() * 100) < 2 ? Math.floor(random() * 4) + 1 : 0,
      flip(0.32),
      random() < 0.22 ? "Yes" : "No",
    ].join(",");
  }
}

// Intentionally invalid rows — exercise every Zod failure mode so the
// reviewer sees real diagnostics in the response.
const BAD_ROWS = [
  // bad Gender
  "9999999999991,9999991,X,2016-03-01T10:00:00Z,2016-03-15T00:00:00Z,30,CENTRO,0,0,0,0,0,0,No",
  // Age out of range
  "9999999999992,9999992,F,2016-04-01T10:00:00Z,2016-04-15T00:00:00Z,150,CENTRO,0,0,0,0,0,0,No",
  // negative Age
  "9999999999993,9999993,M,2016-05-01T10:00:00Z,2016-05-15T00:00:00Z,-3,CENTRO,0,0,0,0,0,0,No",
  // ScheduledDay after AppointmentDay
  "9999999999994,9999994,F,2016-08-01T10:00:00Z,2016-05-15T00:00:00Z,40,CENTRO,0,0,0,0,0,0,No",
  // non-binary Scholarship
  "9999999999995,9999995,M,2016-07-01T10:00:00Z,2016-07-15T00:00:00Z,28,CENTRO,2,0,0,0,0,0,No",
  // Handcap out of range
  "9999999999996,9999996,F,2016-09-01T10:00:00Z,2016-09-15T00:00:00Z,55,CENTRO,0,0,0,0,5,0,No",
  // bad No-show value
  "9999999999997,9999997,M,2016-10-01T10:00:00Z,2016-10-15T00:00:00Z,33,CENTRO,0,0,0,0,0,0,Maybe",
];

await mkdir(dirname(outputPath), { recursive: true });
const stream = createWriteStream(outputPath, { encoding: "utf8" });

function write(line) {
  return new Promise((resolveWrite, rejectWrite) => {
    if (!stream.write(line + "\n")) stream.once("drain", resolveWrite);
    else resolveWrite();
    stream.once("error", rejectWrite);
  });
}

await write(HEADER);
let written = 0;
const start = Date.now();
for (const row of generateRows()) {
  await write(row);
  written++;
  if (written % 50_000 === 0) {
    console.log(`  ...${written.toLocaleString()} rows`);
  }
}
for (const bad of BAD_ROWS) await write(bad);

await new Promise((r) => stream.end(r));

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(
  `Wrote ${(written + BAD_ROWS.length).toLocaleString()} rows ` +
    `(${written.toLocaleString()} valid + ${BAD_ROWS.length} intentionally invalid) ` +
    `to ${outputPath} in ${elapsed}s.`,
);
