import { describe, expect, it } from "vitest";
import {
  batchRequestSchema,
  csvRowSchema,
  yearQuerySchema,
} from "@/src/lib/validation";
import { validRow, withOverrides } from "../fixtures/rows";

describe("csvRowSchema", () => {
  it("parses a canonical valid row", () => {
    const result = csvRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.Gender).toBe("F");
    expect(result.data.Hipertension).toBe(true);
    expect(result.data.SMS_received).toBe(false);
    expect(result.data["No-show"]).toBe(false);
    expect(result.data.AppointmentDay).toBeInstanceOf(Date);
  });

  it("rejects an unknown gender code", () => {
    const result = csvRowSchema.safeParse(withOverrides({ Gender: "X" }));
    expect(result.success).toBe(false);
  });

  it("rejects an age above the documented cap", () => {
    const result = csvRowSchema.safeParse(withOverrides({ Age: "150" }));
    expect(result.success).toBe(false);
  });

  it("rejects a negative age", () => {
    const result = csvRowSchema.safeParse(withOverrides({ Age: "-1" }));
    expect(result.success).toBe(false);
  });

  it("rejects Handcap outside 0..4", () => {
    const result = csvRowSchema.safeParse(withOverrides({ Handcap: "5" }));
    expect(result.success).toBe(false);
  });

  it("rejects non-binary flag values", () => {
    const result = csvRowSchema.safeParse(withOverrides({ Scholarship: "2" }));
    expect(result.success).toBe(false);
  });

  it("rejects scientific-notation IDs to preserve precision", () => {
    const result = csvRowSchema.safeParse(
      withOverrides({ PatientId: "2.987249982E+13" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects ScheduledDay later than AppointmentDay", () => {
    const result = csvRowSchema.safeParse(
      withOverrides({
        ScheduledDay: "2016-05-10T00:00:00Z",
        AppointmentDay: "2016-04-29T00:00:00Z",
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts ScheduledDay exactly equal to AppointmentDay", () => {
    const result = csvRowSchema.safeParse(
      withOverrides({
        ScheduledDay: "2016-04-29T00:00:00Z",
        AppointmentDay: "2016-04-29T00:00:00Z",
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("batchRequestSchema", () => {
  const one = {
    appointment_id: 1,
    patient_id: 100,
    neighbourhood: "CENTRO",
    scheduled_at: "2016-04-29T18:38:08Z",
    appointment_at: "2016-04-30T00:00:00Z",
    sms_received: 0,
    no_show: "No",
  };

  it("accepts a 1-row batch", () => {
    expect(batchRequestSchema.safeParse({ appointments: [one] }).success).toBe(
      true,
    );
  });

  it("rejects an empty batch", () => {
    expect(batchRequestSchema.safeParse({ appointments: [] }).success).toBe(
      false,
    );
  });

  it("rejects a batch over 1000", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      ...one,
      appointment_id: i + 1,
    }));
    expect(
      batchRequestSchema.safeParse({ appointments: rows }).success,
    ).toBe(false);
  });
});

describe("yearQuerySchema", () => {
  it("treats undefined as no year (uses default)", () => {
    const result = yearQuerySchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("coerces a numeric string", () => {
    const result = yearQuerySchema.safeParse("2016");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(2016);
  });

  it("rejects garbage", () => {
    expect(yearQuerySchema.safeParse("twenty-sixteen").success).toBe(false);
  });

  it("rejects years out of range", () => {
    expect(yearQuerySchema.safeParse("1800").success).toBe(false);
  });
});
