import Ajv, { type Schema, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { openApiDocument } from "@/src/openapi";

// Build one AJV instance per test file. `strict: false` because the OpenAPI
// schemas legitimately use `format` keywords AJV doesn't natively know
// (e.g. "binary" for multipart uploads); we don't need format-level
// validation for the response side.
export function buildAjv(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

// OpenAPI 3.1 uses `$ref: "#/components/schemas/X"`. AJV does not resolve
// those against the parent document unless the document is registered as a
// schema with an $id. Rewrite the refs to point at top-level schemas we
// pre-register with simple names.
function rewriteRefs<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => rewriteRefs(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === "$ref" &&
      typeof val === "string" &&
      val.startsWith("#/components/schemas/")
    ) {
      out.$ref = val.slice("#/components/schemas/".length);
    } else {
      out[key] = rewriteRefs(val);
    }
  }
  return out as T;
}

// Pre-register every named component schema under its bare name so the
// rewritten $refs resolve. Also register the named response components.
export function registerComponents(ajv: Ajv): void {
  for (const [name, schema] of Object.entries(
    openApiDocument.components.schemas,
  )) {
    ajv.addSchema(rewriteRefs(schema) as Schema, name);
  }
}

interface ResponseSchemaLocator {
  path: keyof typeof openApiDocument.paths;
  method: "get" | "post";
  status: string;
}

// Extract and compile the JSON Schema for a given operation's response body.
// Throws if the spec doesn't describe that combination — surfaces drift
// between code and spec immediately.
export function compileResponseValidator(
  ajv: Ajv,
  { path, method, status }: ResponseSchemaLocator,
): ValidateFunction {
  const operation = openApiDocument.paths[path]?.[
    method as keyof (typeof openApiDocument.paths)[typeof path]
  ] as
    | {
        responses?: Record<
          string,
          {
            content?: { "application/json"?: { schema?: unknown } };
          } | { $ref: string }
        >;
      }
    | undefined;
  if (!operation) {
    throw new Error(`Spec has no ${method.toUpperCase()} ${String(path)}`);
  }
  const response = operation.responses?.[status];
  if (!response) {
    throw new Error(
      `Spec has no ${status} response for ${method.toUpperCase()} ${String(path)}`,
    );
  }
  if ("$ref" in response) {
    throw new Error(
      `Response is a $ref; this helper only compiles inline schemas`,
    );
  }
  const schema = response.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(
      `No application/json schema for ${status} of ${method.toUpperCase()} ${String(path)}`,
    );
  }
  return ajv.compile(rewriteRefs(schema) as Schema);
}

// Format AJV errors compactly for test assertions.
export function formatErrors(validate: ValidateFunction): string {
  return (
    validate.errors
      ?.map((e) => `${e.instancePath || "(root)"} ${e.message}`)
      .join("; ") ?? "(no errors)"
  );
}
