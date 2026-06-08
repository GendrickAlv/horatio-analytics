import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  csvRowToAppointment,
  csvRowToPatient,
  deriveYearOfBirth,
  zodIssuesToDiagnostics,
} from "@/src/lib/mappers";
import { csvRowSchema } from "@/src/lib/validation";
import { validRow, withOverrides } from "../fixtures/rows";

function parsedFixture(overrides: Record<string, string> = {}) {
  const result = csvRowSchema.safeParse(withOverrides(overrides));
  if (!result.success) throw new Error("fixture failed to parse");
  return result.data;
}

describe("deriveYearOfBirth", () => {
  it("subtracts Age from the appointment year (UTC)", () => {
    expect(deriveYearOfBirth(new Date("2016-04-29T00:00:00Z"), 62)).toBe(1954);
  });

  it("handles age 0", () => {
    expect(deriveYearOfBirth(new Date("2020-01-01T00:00:00Z"), 0)).toBe(2020);
  });
});

describe("csvRowToPatient", () => {
  it("renames Hipertension → hypertension and keeps Handcap numeric", () => {
    const patient = csvRowToPatient(parsedFixture({ Handcap: "3" }));
    expect(patient.hypertension).toBe(true);
    expect(patient.handcap).toBe(3);
    expect(patient.gender).toBe("F");
    expect(patient.yearOfBirth).toBe(1954);
  });
});

describe("csvRowToAppointment", () => {
  it("wires the neighbourhood surrogate FK and maps booleans", () => {
    const appt = csvRowToAppointment(parsedFixture(), 42);
    expect(appt.neighbourhoodId).toBe(42);
    expect(appt.noShow).toBe(false);
    expect(appt.smsReceived).toBe(false);
    expect(appt.patientId).toBe(29872499824296);
  });
});

describe("zodIssuesToDiagnostics", () => {
  it("emits one diagnostic per failing field with raw value carried", () => {
    const result = csvRowSchema.safeParse(
      withOverrides({ Gender: "X", Handcap: "9" }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const diags = zodIssuesToDiagnostics(7, result.error as z.ZodError, validRow);
    expect(diags.length).toBeGreaterThanOrEqual(2);
    expect(diags.every((d) => d.row === 7)).toBe(true);
    const fields = diags.map((d) => d.field);
    expect(fields).toContain("Gender");
    expect(fields).toContain("Handcap");
  });
});
