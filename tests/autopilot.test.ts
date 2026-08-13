import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("daily Autopilot creates one durable evidence-first chain and queues only the first step", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "oneshowseo-autopilot-"),
  );
  process.env.DATABASE_PATH = path.join(directory, "autopilot.sqlite");
  globalThis.__oneShowSeoDatabase = undefined;
  const auth = await import("../lib/auth"),
    product = await import("../lib/product"),
    billing = await import("../lib/billing"),
    autopilot = await import("../lib/autopilot");
  const db = auth.getDatabase(),
    now = Math.floor(Date.now() / 1000);
  await auth.ensureAuthSchema(db);
  db.prepare(
    "INSERT INTO users(id,email,name,password_hash,role,status,plan,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      "auto_owner",
      "auto@example.com",
      "Auto Owner",
      "hash",
      "user",
      "active",
      "pro",
      now,
      now,
      now,
    )
    .run();
  await auth.ensureAuthSchema(db);
  await product.ensureProductSchema();
  db.prepare(
    "INSERT INTO projects(id,user_id,name,site_url,host,market,language,timezone,business_goal,approval_mode,schedule_enabled,created_at,updated_at,organization_id,slug,status,business_type,search_engines,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      "auto_project",
      "auto_owner",
      "Auto Project",
      "https://example.com/",
      "example.com",
      "CN",
      "zh-CN",
      "Asia/Shanghai",
      "organic_growth",
      "required",
      1,
      now,
      now,
      "org_auto_owner",
      "auto-project",
      "active",
      "website",
      '["google"]',
      1,
    )
    .run();
  await billing.ensureBillingSchema();
  billing.commerceService().resolve({
    accountId: "auto_owner",
    organizationId: "org_auto_owner",
    organizationStatus: "active",
    planKey: "pro",
    trialEndsAt: null,
    accountCreatedAt: now,
  });
  await autopilot.configureAutopilot({
    organizationId: "org_auto_owner",
    projectId: "auto_project",
    accountId: "auto_owner",
    enabled: true,
    hour: 3,
    minute: 0,
    timezone: "Asia/Shanghai",
    dailyCreditLimit: 43,
    contentEnabled: true,
    expectedRevision: 0,
  });
  const runId = await autopilot.startAutopilotRun(
    "org_auto_owner",
    "auto_project",
    now,
  );
  assert.equal(
    await autopilot.startAutopilotRun(
      "org_auto_owner",
      "auto_project",
      now + 60,
    ),
    runId,
  );
  await autopilot.advanceAutopilotRuns();
  const steps = db
    .prepare(
      "SELECT stage,status,task_id taskId FROM autopilot_steps WHERE run_id=? ORDER BY position",
    )
    .bind(runId)
    .all<{ stage: string; status: string; taskId: string | null }>().results;
  assert.deepEqual(
    steps.map((item) => item.stage),
    ["research", "audit", "content", "geo", "analytics"],
  );
  assert.equal(steps[0].status, "queued");
  assert.ok(steps[0].taskId);
  assert.ok(steps.slice(1).every((item) => item.status === "pending"));
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) count FROM execution_tasks WHERE correlation_id=?",
      )
      .bind(`autopilot:${runId}`)
      .first<{ count: number }>()?.count,
    1,
  );
});

test("Autopilot enforces budget, keeps publication out of the chain, and worker advances it", async () => {
  const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/autopilot.ts", import.meta.url), "utf8"),
    ),
    worker = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../workers/production-worker.ts", import.meta.url),
        "utf8",
      ),
    );
  assert.match(source, /dailyCreditLimit\s*<\s*23/);
  assert.match(source, /publish:\s*\"approval_required\"/);
  assert.doesNotMatch(source, /content\.publish|publishWordpressPost/);
  assert.match(worker, /advanceAutopilotRuns/);
});
