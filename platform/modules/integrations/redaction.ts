const sensitiveKey = /(authorization|cookie|password|secret|credential|api[-_]?key|access[-_]?token|refresh[-_]?token|encrypted|cipher|nonce|raw[-_]?body)/i;
const sensitiveValue = /(bearer\s+[a-z0-9._~+/=-]{8,}|basic\s+[a-z0-9+/=]{8,}|sv1\.[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/i;

export function sanitizeIntegrationRecord(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return sensitiveValue.test(value) ? "[REDACTED]" : value.slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeIntegrationRecord(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : sanitizeIntegrationRecord(item, depth + 1)]),
    );
  return undefined;
}
