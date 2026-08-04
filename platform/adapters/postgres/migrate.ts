import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadMigrations, migrationStatus, runMigrations } from "./migration-runner";

const { Client } = pg;
const command = process.argv[2] ?? "status";
if (command !== "status" && command !== "migrate") {
  throw new Error("Usage: npm run db:pg:status or npm run db:pg:migrate");
}

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString) {
  throw new Error("DATABASE_MIGRATION_URL is required; the application credential is intentionally rejected.");
}

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const migrations = await loadMigrations(migrationsDirectory);
const client = new Client({ connectionString });

await client.connect();
try {
  const result =
    command === "migrate"
      ? await runMigrations(client, migrations, {
          allowContract: process.env.ALLOW_CONTRACT_MIGRATIONS === "true",
          applicationVersion: process.env.APP_VERSION ?? "development",
          appliedBy: process.env.MIGRATION_ACTOR ?? "deployment",
        })
      : await migrationStatus(client, migrations);
  process.stdout.write(`${JSON.stringify({ command, ...result })}\n`);
} finally {
  await client.end();
}
