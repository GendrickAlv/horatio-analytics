import type { z } from "zod";
import type { NewAppointment, NewPatient } from "../db/schema";
import type { ParsedCsvRow } from "./validation";
import type { RowDiagnostic } from "./diagnostics";

// Convert a Zod issue tree into one diagnostic per failed field.
export function zodIssuesToDiagnostics(
  row: number,
  error: z.ZodError,
  rawRecord: Record<string, string>,
): RowDiagnostic[] {
  return error.issues.map((issue) => {
    const field = issue.path[0]?.toString();
    return {
      row,
      field,
      value: field !== undefined ? rawRecord[field] : undefined,
      error: issue.message,
    };
  });
}

// `year_of_birth = year(AppointmentDay) − Age`. Approximate ±1 year because
// the source only stores age at the time of the appointment (no DOB).
export function deriveYearOfBirth(appointmentDay: Date, age: number): number {
  return appointmentDay.getUTCFullYear() - age;
}

export function csvRowToPatient(parsed: ParsedCsvRow): NewPatient {
  return {
    patientId: parsed.PatientId,
    gender: parsed.Gender,
    yearOfBirth: deriveYearOfBirth(parsed.AppointmentDay, parsed.Age),
    scholarship: parsed.Scholarship,
    // Rename CSV typo `Hipertension` → `hypertension`.
    hypertension: parsed.Hipertension,
    diabetes: parsed.Diabetes,
    alcoholism: parsed.Alcoholism,
    handcap: parsed.Handcap,
  };
}

export function csvRowToAppointment(
  parsed: ParsedCsvRow,
  neighbourhoodId: number,
): NewAppointment {
  return {
    appointmentId: parsed.AppointmentID,
    patientId: parsed.PatientId,
    neighbourhoodId,
    scheduledAt: parsed.ScheduledDay,
    appointmentAt: parsed.AppointmentDay,
    smsReceived: parsed.SMS_received,
    noShow: parsed["No-show"],
  };
}
