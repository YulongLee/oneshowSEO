import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertForwardCompatible,
  loadMigrations,
  type AppliedMigration,
  type MigrationFile,
} from "../platform/adapters/postgres/migration-runner";

test("migration files require ordered phase and rollback metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oneshowseo-migrations-"));
  try {
    await writeFile(
      path.join(directory, "0001_expand_foundation.sql"),
      "-- description: foundation\n-- rollback: restore snapshot\n-- minimum-app-version: 0.1.0\nSELECT 1;\n",
    );
    const migrations = await loadMigrations(directory);
    assert.equal(migrations.length, 1);
    assert.equal(migrations[0].phase, "expand");
    assert.equal(migrations[0].rollbackRef, "restore snapshot");
    assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migration history rejects modified or unknown applied migrations", () => {
  const file = {
    id: "0001",
    phase: "expand",
    checksum: "expected",
  } as MigrationFile;
  assert.throws(
    () =>
      assertForwardCompatible([file], [
        { id: "0001", phase: "expand", checksum: "changed" } as AppliedMigration,
      ]),
    /checksum changed/,
  );
  assert.throws(
    () =>
      assertForwardCompatible([file], [
        { id: "9999", phase: "expand", checksum: "expected" } as AppliedMigration,
      ]),
    /not a prefix/,
  );
});

test("the checked-in migration chain has complete metadata and remains ordered",async()=>{
  const migrations=await loadMigrations(new URL("../platform/adapters/postgres/migrations",import.meta.url).pathname);
  assert.equal(migrations.at(-1)?.id,"0012");
  assert.deepEqual(migrations.map(migration=>migration.id),["0001","0002","0003","0004","0005","0006","0007","0008","0009","0010","0011","0012"]);
});
