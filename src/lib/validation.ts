import { z } from "zod";

// Reject scientific notation up-front: the official CSV sometimes serialises
// 14-digit IDs as floats, which Number() parses lossily. A digits-only string
// guarantees we keep full precision.
const integerString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform((value, ctx) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      ctx.addIssue({
        code: "custom",
        message: "exceeds JavaScript safe-integer range",
      });
      return z.NEVER;
    }
    return parsed;
  });

const binaryFlag = z
  .enum(["0", "1"])
  .transform((value) => value === "1");

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a valid ISO-8601 date-time",
  })
  .transform((value) => new Date(value));

// One row of the Kaggle "Medical Appointment No Shows" CSV.
// `Hipertension` carries the source typo; we rename it on the way out (see mappers).
export const csvRowSchema = z
  .object({
    PatientId: integerString,
    AppointmentID: integerString,
    Gender: z.enum(["M", "F"]),
    ScheduledDay: isoDateTime,
    AppointmentDay: isoDateTime,
    Age: z.coerce.number().int().min(0).max(120),
    Neighbourhood: z.string().trim().min(1),
    Scholarship: binaryFlag,
    Hipertension: binaryFlag,
    Diabetes: binaryFlag,
    Alcoholism: binaryFlag,
    Handcap: z.coerce.number().int().min(0).max(4),
    SMS_received: binaryFlag,
    "No-show": z.enum(["Yes", "No"]).transform((value) => value === "Yes"),
  })
  // `AppointmentDay` in the source CSV is always at 00:00:00 UTC while
  // `ScheduledDay` carries the booking time-of-day. Comparing the full
  // timestamps would reject almost every same-day booking. The logical
  // invariant is "scheduled on or before the appointment *date*".
  .refine(
    (row) =>
      row.ScheduledDay.toISOString().slice(0, 10) <=
      row.AppointmentDay.toISOString().slice(0, 10),
    {
      message: "ScheduledDay must be on or before AppointmentDay",
      path: ["ScheduledDay"],
    },
  );

export type ParsedCsvRow = z.infer<typeof csvRowSchema>;

// Body schema for POST /api/appointments/batch.
export const batchAppointmentSchema = z.object({
  appointment_id: z.number().int().nonnegative(),
  patient_id: z.number().int().nonnegative(),
  neighbourhood: z.string().trim().min(1),
  scheduled_at: isoDateTime,
  appointment_at: isoDateTime,
  sms_received: z.union([z.literal(0), z.literal(1)]).transform((v) => v === 1),
  no_show: z.enum(["Yes", "No"]).transform((v) => v === "Yes"),
});

export type BatchAppointmentInput = z.infer<typeof batchAppointmentSchema>;

export const batchRequestSchema = z.object({
  appointments: z.array(batchAppointmentSchema).min(1).max(1000),
});

export type BatchRequest = z.infer<typeof batchRequestSchema>;

// Year query param for analytics endpoints.
export const yearQuerySchema = z.coerce
  .number()
  .int()
  .min(1900)
  .max(2200)
  .optional();
