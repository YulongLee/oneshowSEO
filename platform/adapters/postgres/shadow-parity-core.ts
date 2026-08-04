import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const shadowCategories = {
  authentication: ["sessions", "email_verification_tokens", "email_codes"],
  users: ["users"],
  projects: ["projects", "project_members", "project_invites"],
  tasks: ["seo_tasks"],
  findings: ["findings"],
  research: ["research_runs", "research_opportunities"],
  approvals: ["approval_decisions"],
  usage: ["usage_events"],
  billing: ["billing_invoices", "billing_payment_methods", "billing_events"],
  api_access: ["api_access_keys", "api_request_events", "api_webhooks"],
} as const;

export type ShadowCategory = keyof typeof shadowCategories;
export interface ShadowMetric {
  category: ShadowCategory;
  sourceTable: string;
  rowCount: number;
  rowHash: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function metricsHash(metrics: ShadowMetric[]): string {
  return createHash("sha256").update(stable(metrics)).digest("hex");
}

export function readShadowMetrics(filename: string): ShadowMetric[] {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const metrics: ShadowMetric[] = [];
    for (const [category, tables] of Object.entries(shadowCategories) as Array<
      [ShadowCategory, readonly string[]]
    >) {
      for (const sourceTable of tables) {
        const exists = database
          .prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?")
          .get(sourceTable);
        const rows = exists
          ? (database.prepare(`SELECT * FROM "${sourceTable}" ORDER BY 1`).all() as Array<Record<string, unknown>>)
          : [];
        metrics.push({
          category,
          sourceTable,
          rowCount: rows.length,
          rowHash: createHash("sha256").update(stable(rows)).digest("hex"),
        });
      }
    }
    return metrics;
  } finally {
    database.close();
  }
}

export function compareShadowMetrics(expected: ShadowMetric[], actual: ShadowMetric[]) {
  const actualByKey = new Map(actual.map((metric) => [`${metric.category}:${metric.sourceTable}`, metric]));
  return expected.flatMap((metric) => {
    const current = actualByKey.get(`${metric.category}:${metric.sourceTable}`);
    if (!current) return [{ category: metric.category, sourceTable: metric.sourceTable, issue: "missing" }];
    if (current.rowCount !== metric.rowCount || current.rowHash !== metric.rowHash) {
      return [
        {
          category: metric.category,
          sourceTable: metric.sourceTable,
          issue: "mismatch",
          expectedRows: metric.rowCount,
          actualRows: current.rowCount,
          expectedHash: metric.rowHash,
          actualHash: current.rowHash,
        },
      ];
    }
    return [];
  });
}
