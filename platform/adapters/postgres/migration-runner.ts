import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type MigrationPhase = "expand" | "migrate" | "contract";

export interface MigrationFile {
  id: string;
  phase: MigrationPhase;
  description: string;
  rollbackRef: string;
  minimumAppVersion: string;
  checksum: string;
  sql: string;
  filename: string;
}

export interface AppliedMigration {
  id: string;
  phase: MigrationPhase;
  checksum: string;
}

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

export interface MigrationClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
}

const filenamePattern = /^(\d{4})_(expand|migrate|contract)_([a-z0-9_]+)\.sql$/;

function requiredMetadata(sql: string, key: string): string {
  const match = sql.match(new RegExp(`^--\\s*${key}:\\s*(.+)$`, "mi"));
  if (!match?.[1]?.trim()) {
    throw new Error(`Migration is missing required metadata: ${key}`);
  }
  return match[1].trim();
}

export async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".sql")).sort();
  const migrations = await Promise.all(
    filenames.map(async (filename) => {
      const match = filename.match(filenamePattern);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }
      const sql = await readFile(path.join(directory, filename), "utf8");
      return {
        id: match[1],
        phase: match[2] as MigrationPhase,
        description: requiredMetadata(sql, "description"),
        rollbackRef: requiredMetadata(sql, "rollback"),
        minimumAppVersion: requiredMetadata(sql, "minimum-app-version"),
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
        filename,
      } satisfies MigrationFile;
    }),
  );

  const ids = new Set<string>();
  for (const migration of migrations) {
    if (ids.has(migration.id)) {
      throw new Error(`Duplicate migration id: ${migration.id}`);
    }
    ids.add(migration.id);
  }
  return migrations;
}

export function assertForwardCompatible(files: MigrationFile[], applied: AppliedMigration[]): void {
  if (applied.length > files.length) {
    throw new Error("Database contains migrations that are not present in this release.");
  }
  for (let index = 0; index < applied.length; index += 1) {
    const expected = files[index];
    const current = applied[index];
    if (!expected || expected.id !== current.id || expected.phase !== current.phase) {
      throw new Error(`Migration history is not a prefix of this release at ${current.id}.`);
    }
    if (expected.checksum !== current.checksum) {
      throw new Error(`Applied migration checksum changed: ${current.id}.`);
    }
  }
}

async function ensureMigrationTable(client: MigrationClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.platform_schema_migrations (
      id text PRIMARY KEY,
      phase text NOT NULL CHECK (phase IN ('expand', 'migrate', 'contract')),
      description text NOT NULL,
      checksum text NOT NULL,
      rollback_ref text NOT NULL,
      minimum_app_version text NOT NULL,
      applied_by text NOT NULL,
      application_version text NOT NULL,
      execution_ms integer NOT NULL CHECK (execution_ms >= 0),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client: MigrationClient): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    "SELECT id, phase, checksum FROM public.platform_schema_migrations ORDER BY id",
  );
  return result.rows;
}

export interface MigrationRunOptions {
  allowContract: boolean;
  applicationVersion: string;
  appliedBy: string;
}

export interface MigrationRunResult {
  applied: string[];
  pending: string[];
}

export async function migrationStatus(
  client: MigrationClient,
  files: MigrationFile[],
): Promise<MigrationRunResult> {
  await ensureMigrationTable(client);
  const applied = await appliedMigrations(client);
  assertForwardCompatible(files, applied);
  return {
    applied: applied.map((migration) => migration.id),
    pending: files.slice(applied.length).map((migration) => migration.id),
  };
}

export async function runMigrations(
  client: MigrationClient,
  files: MigrationFile[],
  options: MigrationRunOptions,
): Promise<MigrationRunResult> {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["oneshowseo:platform-schema-migrations"]);
  try {
    await ensureMigrationTable(client);
    const applied = await appliedMigrations(client);
    assertForwardCompatible(files, applied);
    const pending = files.slice(applied.length);
    const completed: string[] = [];

    for (const migration of pending) {
      if (migration.phase === "contract" && !options.allowContract) {
        throw new Error(
          `Contract migration ${migration.id} requires ALLOW_CONTRACT_MIGRATIONS=true and a recorded compatibility review.`,
        );
      }
      const startedAt = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO public.platform_schema_migrations
            (id, phase, description, checksum, rollback_ref, minimum_app_version, applied_by, application_version, execution_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            migration.id,
            migration.phase,
            migration.description,
            migration.checksum,
            migration.rollbackRef,
            migration.minimumAppVersion,
            options.appliedBy,
            options.applicationVersion,
            Math.max(0, Date.now() - startedAt),
          ],
        );
        await client.query("COMMIT");
        completed.push(migration.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return { applied: [...applied.map((migration) => migration.id), ...completed], pending: [] };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["oneshowseo:platform-schema-migrations"]);
  }
}
