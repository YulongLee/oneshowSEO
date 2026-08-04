import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareShadowMetrics,
  metricsHash,
  readShadowMetrics,
  shadowCategories,
} from "../platform/adapters/postgres/shadow-parity-core";

test("shadow parity covers every migration category with count and hash", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oneshowseo-shadow-"));
  const filename = path.join(directory, "source.sqlite");
  const database = new DatabaseSync(filename);
  database.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('user-1');");
  database.close();
  try {
    const metrics = readShadowMetrics(filename);
    assert.equal(new Set(metrics.map((metric) => metric.category)).size, Object.keys(shadowCategories).length);
    assert.equal(metrics.find((metric) => metric.sourceTable === "users")?.rowCount, 1);
    assert.match(metricsHash(metrics), /^[a-f0-9]{64}$/);
    assert.deepEqual(compareShadowMetrics(metrics, metrics), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shadow parity reports changed rows without exposing their content", () => {
  const baseline = [{ category: "users" as const, sourceTable: "users", rowCount: 1, rowHash: "old" }];
  const current = [{ category: "users" as const, sourceTable: "users", rowCount: 2, rowHash: "new" }];
  const mismatches = compareShadowMetrics(baseline, current);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].issue, "mismatch");
  assert.equal(JSON.stringify(mismatches).includes("user@example.com"), false);
});
