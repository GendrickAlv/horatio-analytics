import { z } from "zod";
import { batchRequestSchema, yearQuerySchema } from "./lib/validation";

// Derive JSON Schemas from the same Zod schemas the runtime validators use, so
// the spec cannot drift from the wire contract. Zod 4 emits draft-2020-12
// (OpenAPI 3.1 is a superset of it). `io: "input"` documents the shape the
// client sends over the wire (e.g. `sms_received` as 0/1) rather than the
// post-transform domain shape — the latter is internal to the service.
// `unrepresentable: "any"` is a safety net for any future transform we add.
const batchRequestJsonSchema = z.toJSONSchema(batchRequestSchema, {
  target: "draft-2020-12",
  io: "input",
  unrepresentable: "any",
});
const yearQueryJsonSchema = z.toJSONSchema(yearQuerySchema, {
  target: "draft-2020-12",
  io: "input",
  unrepresentable: "any",
});

const diagnosticSchema = {
  type: "object",
  required: ["row", "field", "value", "error"],
  properties: {
    row: { type: "integer", description: "1-based row index in the input." },
    field: { type: "string" },
    value: {},
    error: { type: "string" },
  },
} as const;

const historicalResponseSchema = {
  type: "object",
  required: ["summary", "diagnostics", "truncated"],
  properties: {
    summary: {
      type: "object",
      required: ["received", "inserted", "skipped"],
      properties: {
        received: { type: "integer" },
        inserted: { type: "integer" },
        skipped: { type: "integer" },
      },
    },
    diagnostics: { type: "array", items: { $ref: "#/components/schemas/Diagnostic" } },
    truncated: { type: "boolean" },
  },
} as const;

const batchResponseSchema = {
  type: "object",
  required: ["summary", "diagnostics", "truncated"],
  properties: {
    summary: {
      type: "object",
      required: ["received", "inserted", "rejected"],
      properties: {
        received: { type: "integer" },
        inserted: { type: "integer" },
        rejected: { type: "integer" },
      },
    },
    diagnostics: { type: "array", items: { $ref: "#/components/schemas/Diagnostic" } },
    truncated: { type: "boolean" },
  },
} as const;

const noShowsByQuarterResponseSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["neighbourhood", "gender", "Q1", "Q2", "Q3", "Q4"],
    properties: {
      neighbourhood: { type: "string" },
      gender: { type: "string", enum: ["M", "F"] },
      Q1: { type: "integer" },
      Q2: { type: "integer" },
      Q3: { type: "integer" },
      Q4: { type: "integer" },
    },
  },
} as const;

const aboveAverageResponseSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["id", "neighbourhood", "no_shows"],
    properties: {
      id: { type: "integer" },
      neighbourhood: { type: "string" },
      no_shows: { type: "integer" },
    },
  },
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Horatio Analytics API",
    version: "1.0.0",
    description:
      "REST API for ingesting healthcare appointment data (historical CSV " +
      "and JSON batches) and querying no-show analytics by neighbourhood, " +
      "gender and quarter.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
  paths: {
    "/api/health": {
      get: {
        summary: "Liveness probe",
        responses: {
          "200": {
            description: "Service is up.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string", enum: ["ok"] } },
                },
              },
            },
          },
        },
      },
    },
    "/api/ingest/historical": {
      post: {
        summary: "Bulk-load the historical no-show CSV",
        description:
          "Streams a Kaggle-format CSV through Zod validation and persists " +
          "valid rows. Invalid rows are skipped and reported in `diagnostics`.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Ingestion summary and row-level diagnostics.",
            content: {
              "application/json": { schema: historicalResponseSchema },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/api/appointments/batch": {
      post: {
        summary: "Insert a batch of 1..1000 appointments",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: batchRequestJsonSchema },
          },
        },
        responses: {
          "200": {
            description: "Insertion summary and row-level diagnostics.",
            content: {
              "application/json": { schema: batchResponseSchema },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/api/analytics/no-shows-by-quarter": {
      get: {
        summary: "No-shows pivoted by neighbourhood × gender × quarter",
        parameters: [
          {
            name: "year",
            in: "query",
            required: false,
            schema: yearQueryJsonSchema,
            description:
              "Calendar year to analyse. Defaults to the latest year " +
              "present in `appointments`.",
          },
        ],
        responses: {
          "200": {
            description: "One row per (neighbourhood, gender) combination.",
            content: {
              "application/json": { schema: noShowsByQuarterResponseSchema },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/api/analytics/above-average-no-shows": {
      get: {
        summary: "Neighbourhoods above the mean no-show count for the year",
        parameters: [
          {
            name: "year",
            in: "query",
            required: false,
            schema: yearQueryJsonSchema,
          },
        ],
        responses: {
          "200": {
            description: "Neighbourhoods with no_shows > AVG(no_shows).",
            content: {
              "application/json": { schema: aboveAverageResponseSchema },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/api/openapi": {
      get: {
        summary: "OpenAPI 3.1 specification for this API",
        responses: {
          "200": {
            description: "Spec document.",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Diagnostic: diagnosticSchema,
    },
    responses: {
      BadRequest: {
        description: "Request body or query parameters failed validation.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["error"],
              properties: {
                error: { type: "string" },
                diagnostics: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Diagnostic" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type OpenApiDocument = typeof openApiDocument;
