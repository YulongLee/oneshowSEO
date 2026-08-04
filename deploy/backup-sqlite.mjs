import { existsSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { backup, DatabaseSync } from "node:sqlite";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node backup-sqlite.mjs <source> <destination>");
if (existsSync(destination)) throw new Error(`Backup destination already exists: ${destination}`);

const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, destination);
} finally {
  database.close();
}

const verification = new DatabaseSync(destination, { readOnly: true });
try {
  const row = verification.prepare("PRAGMA integrity_check").get();
  if (row?.integrity_check !== "ok") throw new Error("SQLite backup integrity check failed.");
} finally {
  verification.close();
}
await chmod(destination, 0o600);
process.stdout.write(`${destination}: integrity ok\n`);
