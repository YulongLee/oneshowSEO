import type { CorrelationId, OrganizationId, ProjectId, UserId } from "./ids";

export const CONTRACT_VERSION = "2026-08-04" as const;

export type Locale = "zh-CN" | "en";
export type DataState =
  | "fresh"
  | "stale"
  | "syncing"
  | "unavailable"
  | "permission_required"
  | "no_data"
  | "error"
  | "demo";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ENTITLEMENT_REQUIRED"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type RequestContext = {
  correlationId: CorrelationId;
  locale: Locale;
  userId?: UserId;
  organizationId?: OrganizationId;
  projectId?: ProjectId;
};

export type ApiSuccess<T> = {
  ok: true;
  version: typeof CONTRACT_VERSION;
  correlationId: CorrelationId;
  data: T;
};

export type ApiFailure = {
  ok: false;
  version: typeof CONTRACT_VERSION;
  correlationId: CorrelationId;
  error: { code: ErrorCode; message: string; retryable: boolean; retryAfterSeconds?: number };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type PageRequest = { cursor?: string; limit: number };
export type PageResult<T> = { items: T[]; nextCursor: string | null; total?: number };

export type VersionedRecord = { version: number; createdAt: number; updatedAt: number };

export type MetricProvenance = {
  state: DataState;
  sourceType: string;
  sourceId?: string;
  capturedAt?: number;
  freshnessSeconds?: number;
  completeness?: number;
};

export function success<T>(correlationId: CorrelationId, data: T): ApiSuccess<T> {
  return { ok: true, version: CONTRACT_VERSION, correlationId, data };
}

export function failure(correlationId: CorrelationId, code: ErrorCode, message: string, retryable = false): ApiFailure {
  return { ok: false, version: CONTRACT_VERSION, correlationId, error: { code, message, retryable } };
}

export function pageLimit(value: unknown, maximum = 100): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 25;
  return Math.min(parsed, maximum);
}
