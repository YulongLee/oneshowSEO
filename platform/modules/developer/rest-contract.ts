export const PUBLIC_API_VERSION = "v1" as const;
export const PUBLIC_API_REVISION = "2026-08-06" as const;

export const developerScopes = [
  "projects:read",
  "tasks:read",
  "tasks:write",
  "approvals:read",
  "approvals:write",
  "artifacts:read",
  "integrations:read",
  "webhooks:manage",
] as const;
export type DeveloperScope = (typeof developerScopes)[number];

export const publicErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "VALIDATION_FAILED",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "ENTITLEMENT_REQUIRED",
  "DEPENDENCY_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;
export type PublicErrorCode = (typeof publicErrorCodes)[number];

export type PublicApiMeta = { nextCursor?: string | null; count?: number; deprecation?: { sunsetAt: string; successor: string } };
export type PublicApiSuccess<T> = { ok: true; apiVersion: typeof PUBLIC_API_VERSION; correlationId: string; data: T; meta?: PublicApiMeta };
export type PublicApiFailure = { ok: false; apiVersion: typeof PUBLIC_API_VERSION; correlationId: string; error: { code: PublicErrorCode; message: string; retryable: boolean; retryAfterSeconds?: number; fields?: Record<string, string> } };

export function requestCorrelationId(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(supplied) ? supplied : `req_${crypto.randomUUID()}`;
}

export function publicSuccess<T>(correlationId: string, data: T, meta?: PublicApiMeta): PublicApiSuccess<T> {
  return { ok: true, apiVersion: PUBLIC_API_VERSION, correlationId, data, ...(meta ? { meta } : {}) };
}

export function publicFailure(correlationId: string, code: PublicErrorCode, message: string, retryable = false, extra?: Pick<PublicApiFailure["error"], "retryAfterSeconds" | "fields">): PublicApiFailure {
  return { ok: false, apiVersion: PUBLIC_API_VERSION, correlationId, error: { code, message, retryable, ...extra } };
}

export function publicResponseHeaders(correlationId: string, deprecation?: { sunsetAt: string; successor: string }): HeadersInit {
  return {
    "x-api-version": PUBLIC_API_VERSION,
    "x-correlation-id": correlationId,
    ...(deprecation ? { deprecation: "true", sunset: deprecation.sunsetAt, link: `<${deprecation.successor}>; rel="successor-version"` } : {}),
  };
}

export function parsePage(url: string, maximum = 100): { offset: number; limit: number } {
  const query = new URL(url).searchParams;
  const requested = Number(query.get("limit") || 25);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, maximum) : 25;
  const cursor = query.get("cursor");
  if (!cursor) return { offset: 0, limit };
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { v?: unknown; offset?: unknown };
    if (parsed.v !== 1 || !Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error("invalid");
    return { offset: Number(parsed.offset), limit };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export function nextPageCursor(offset: number, limit: number, returned: number): string | null {
  return returned < limit ? null : Buffer.from(JSON.stringify({ v: 1, offset: offset + returned })).toString("base64url");
}

export function validIdempotencyKey(value: string | null): boolean {
  return value !== null && /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value);
}

export const publicApiContract = {
  openapi: "3.1.0",
  info: {
    title: "OneShowSEO Public API",
    version: PUBLIC_API_REVISION,
    description: "Versioned tenant-scoped API. Mutations require Idempotency-Key; every response carries X-Correlation-Id.",
  },
  servers: [{ url: "https://oneshowseo.com/api/v1" }],
  security: [{ bearerApiKey: [] }],
  paths: {
    "/projects": { get: { operationId: "listProjects", summary: "List scoped projects", security: [{ bearerApiKey: ["projects:read"] }], parameters: [{ name: "cursor", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }], responses: { "200": { description: "Versioned project page" }, "401": { description: "Invalid credential" }, "429": { description: "Rate limited" } } } },
    "/projects/{id}": { get: { operationId: "getProject", summary: "Get a scoped project", security: [{ bearerApiKey: ["projects:read"] }], responses: { "200": { description: "Versioned project" }, "404": { description: "Not found without tenant disclosure" } } } },
  },
  components: {
    securitySchemes: { bearerApiKey: { type: "http", scheme: "bearer", bearerFormat: "osseo_live_*", description: "Organization-owned, project- and action-scoped key." } },
    schemas: {
      ErrorCode: { type: "string", enum: publicErrorCodes },
      Scope: { type: "string", enum: developerScopes },
      Error: { type: "object", required: ["ok", "apiVersion", "correlationId", "error"], properties: { ok: { const: false }, apiVersion: { const: PUBLIC_API_VERSION }, correlationId: { type: "string" }, error: { type: "object", required: ["code", "message", "retryable"], properties: { code: { $ref: "#/components/schemas/ErrorCode" }, message: { type: "string" }, retryable: { type: "boolean" }, retryAfterSeconds: { type: "integer", minimum: 0 }, fields: { type: "object", additionalProperties: { type: "string" } } } } } },
    },
  },
  "x-oneshowseo-policies": {
    pagination: "Opaque cursors are versioned and page size is capped at 100.",
    idempotency: "Mutation and execution requests require a 16-128 character Idempotency-Key. Equivalent retries return the original operation; payload drift returns IDEMPOTENCY_CONFLICT.",
    deprecation: "Breaking changes use a new URL version. Deprecated versions emit Deprecation, Sunset, and successor Link headers for at least 180 days.",
    correlation: "A valid caller X-Correlation-Id is preserved; otherwise the server generates one and returns it in headers and body.",
  },
} as const;
