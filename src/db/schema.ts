import {
  bigint,
  boolean,
  char,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// One row per patient. `patient_id` is the natural key carried from the source CSV.
// `year_of_birth` is derived from (AppointmentDay − Age) at ingestion time
// (approximate ±1 year, documented in the README).
export const patients = pgTable("patients", {
  patientId: bigint("patient_id", { mode: "number" }).primaryKey(),
  gender: char("gender", { length: 1 }).notNull(),
  yearOfBirth: smallint("year_of_birth").notNull(),
  scholarship: boolean("scholarship").notNull(),
  hypertension: boolean("hypertension").notNull(),
  diabetes: boolean("diabetes").notNull(),
  alcoholism: boolean("alcoholism").notNull(),
  // Severity 0..4 — NOT a boolean (CSV field "Handcap" is misleadingly named).
  handcap: smallint("handcap").notNull(),
});

// Surrogate-key lookup so the fact table stores a 4-byte FK instead of repeating
// neighbourhood strings on every row.
export const neighbourhoods = pgTable("neighbourhoods", {
  neighbourhoodId: serial("neighbourhood_id").primaryKey(),
  name: text("name").notNull().unique(),
});

// Fact table — one row per appointment.
export const appointments = pgTable(
  "appointments",
  {
    appointmentId: bigint("appointment_id", { mode: "number" }).primaryKey(),
    patientId: bigint("patient_id", { mode: "number" })
      .notNull()
      .references(() => patients.patientId),
    neighbourhoodId: integer("neighbourhood_id")
      .notNull()
      .references(() => neighbourhoods.neighbourhoodId),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
    smsReceived: boolean("sms_received").notNull(),
    noShow: boolean("no_show").notNull(),
  },
  (table) => [
    index("appointments_appointment_at_idx").on(table.appointmentAt),
    index("appointments_patient_id_idx").on(table.patientId),
    index("appointments_neighbourhood_id_idx").on(table.neighbourhoodId),
    // Composite index sized for the two analytics queries
    // (filter by year on appointment_at, then group by no_show + neighbourhood).
    index("appointments_analytics_idx").on(
      table.appointmentAt,
      table.noShow,
      table.neighbourhoodId,
    ),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type Neighbourhood = typeof neighbourhoods.$inferSelect;
export type NewNeighbourhood = typeof neighbourhoods.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
