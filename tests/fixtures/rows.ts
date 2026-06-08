// Shared fixture: one valid raw CSV record. Tests override individual fields
// to keep edge-case payloads tiny and readable.
export const validRow: Record<string, string> = {
  PatientId: "29872499824296",
  AppointmentID: "5642903",
  Gender: "F",
  ScheduledDay: "2016-04-29T18:38:08Z",
  AppointmentDay: "2016-04-29T00:00:00Z",
  Age: "62",
  Neighbourhood: "JARDIM DA PENHA",
  Scholarship: "0",
  Hipertension: "1",
  Diabetes: "0",
  Alcoholism: "0",
  Handcap: "0",
  SMS_received: "0",
  "No-show": "No",
};

export function withOverrides(
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...validRow, ...overrides };
}
