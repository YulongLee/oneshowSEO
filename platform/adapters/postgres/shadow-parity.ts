import path from "node:path";
import pg from "pg";
import {
  compareShadowMetrics,
  metricsHash,
  readShadowMetrics,
  type ShadowCategory,
  type ShadowMetric,
} from "./shadow-parity-core";

const { Client } = pg;
const command = process.argv[2] ?? "verify";
if (command !== "capture" && command !== "verify") throw new Error("Use capture or verify.");
const sqlitePath = process.env.SQLITE_SOURCE_PATH;
const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!sqlitePath || !connectionString) throw new Error("SQLITE_SOURCE_PATH and DATABASE_MIGRATION_URL are required.");

const current = readShadowMetrics(sqlitePath);
const sourceSnapshotHash = metricsHash(current);
const snapshotId = `shadow_${sourceSnapshotHash.slice(0, 32)}`;
const client = new Client({ connectionString });
await client.connect();

try {
  if (command === "capture") {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO public.platform_shadow_snapshots (id,source_snapshot_hash,source_label,status)
         VALUES ($1,$2,$3,'capturing') ON CONFLICT (source_snapshot_hash) DO NOTHING`,
        [snapshotId, sourceSnapshotHash, path.basename(sqlitePath)],
      );
      for (const metric of current) {
        await client.query(
          `INSERT INTO public.platform_shadow_metrics (snapshot_id,category,source_table,row_count,row_hash)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (snapshot_id,category,source_table) DO NOTHING`,
          [snapshotId, metric.category, metric.sourceTable, metric.rowCount, metric.rowHash],
        );
      }
      await client.query(
        "UPDATE public.platform_shadow_snapshots SET status='complete',completed_at=COALESCE(completed_at,now()) WHERE id=$1",
        [snapshotId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const selected =
    command === "capture"
      ? snapshotId
      : (
          await client.query<{ id: string }>(
            "SELECT id FROM public.platform_shadow_snapshots WHERE status='complete' ORDER BY completed_at DESC,id DESC LIMIT 1",
          )
        ).rows[0]?.id;
  if (!selected) throw new Error("SHADOW_BASELINE_MISSING");
  const stored = await client.query<{
    category: ShadowCategory;
    source_table: string;
    row_count: number;
    row_hash: string;
  }>(
    "SELECT category,source_table,row_count,row_hash FROM public.platform_shadow_metrics WHERE snapshot_id=$1 ORDER BY category,source_table",
    [selected],
  );
  const expected: ShadowMetric[] = stored.rows.map((row) => ({
    category: row.category,
    sourceTable: row.source_table,
    rowCount: row.row_count,
    rowHash: row.row_hash,
  }));
  const mismatches = compareShadowMetrics(expected, current);
  process.stdout.write(
    `${JSON.stringify({ command, snapshotId: selected, sourceSnapshotHash, categories: new Set(current.map((item) => item.category)).size, metrics: current.length, mismatches })}\n`,
  );
  if (mismatches.length > 0) process.exitCode = 2;
} finally {
  await client.end();
}
