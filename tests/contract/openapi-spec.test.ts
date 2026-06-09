import { describe, expect, it } from "vitest";
import { openApiDocument } from "@/src/openapi";

// Structural sanity checks for the generated spec. These run without a
// database — they validate the document itself, not the runtime behaviour.
describe("OpenAPI document", () => {
  it("declares OpenAPI 3.1.0", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
  });

  it("has an info block with title and version", () => {
    expect(openApiDocument.info.title).toBeTruthy();
    expect(openApiDocument.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    ["/api/health", "get"],
    ["/api/ingest/historical", "post"],
    ["/api/appointments/batch", "post"],
    ["/api/analytics/no-shows-by-quarter", "get"],
    ["/api/analytics/above-average-no-shows", "get"],
    ["/api/openapi", "get"],
  ] as const)("declares %s %s", (path, method) => {
    const operation = (
      openApiDocument.paths as Record<string, Record<string, unknown>>
    )[path]?.[method];
    expect(operation).toBeDefined();
  });

  it("declares a 200 response with application/json on every operation", () => {
    for (const [path, methods] of Object.entries(openApiDocument.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const op = operation as {
          responses?: Record<string, unknown>;
        };
        const response = op.responses?.["200"] as
          | { content?: { "application/json"?: unknown } }
          | undefined;
        expect(
          response?.content?.["application/json"],
          `${method.toUpperCase()} ${path}`,
        ).toBeDefined();
      }
    }
  });

  it("registers the Diagnostic component schema", () => {
    expect(openApiDocument.components.schemas.Diagnostic).toBeDefined();
  });
});
