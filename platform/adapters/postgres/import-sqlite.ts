import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

type Row = Record<string, unknown>;
type SourceSnapshot = Record<string, Row[]>;

const { Client } = pg;
const sourceTables = [
  "users",
  "sessions",
  "projects",
  "project_members",
  "project_invites",
  "audit_logs",
  "platform_feature_flags",
  "platform_audit_events",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Row)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function rowsHash(rows: Row[]): string {
  return sha256(stable(rows));
}

function idsHash(ids: string[]): string {
  return sha256(ids.slice().sort().join("\n"));
}

function opaqueId(prefix: string, source: string): string {
  return `${prefix}_${sha256(source).slice(0, 32)}`;
}

function epoch(value: unknown): Date | null {
  return value === null || value === undefined ? null : new Date(Number(value) * 1000);
}

async function fileHash(filename: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function readSnapshot(filename: string): SourceSnapshot {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const snapshot: SourceSnapshot = {};
    for (const table of sourceTables) {
      const exists = database
        .prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) as Row | undefined;
      snapshot[table] = exists
        ? (database.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all() as Row[])
        : [];
    }
    return snapshot;
  } finally {
    database.close();
  }
}

function validateOwnership(snapshot: SourceSnapshot): string[] {
  const issues: string[] = [];
  const userIds = new Set(snapshot.users.map((row) => String(row.id)));
  const projectOwners = new Map(snapshot.projects.map((row) => [String(row.id), String(row.user_id)]));
  for (const session of snapshot.sessions) {
    if (!userIds.has(String(session.user_id))) issues.push(`session:${session.id}:missing-user`);
  }
  for (const project of snapshot.projects) {
    if (!userIds.has(String(project.user_id))) issues.push(`project:${project.id}:missing-owner`);
  }
  for (const member of snapshot.project_members) {
    if (!projectOwners.has(String(member.project_id))) issues.push(`member:${member.project_id}:missing-project`);
    if (!userIds.has(String(member.user_id))) issues.push(`member:${member.user_id}:missing-user`);
  }
  for (const invitation of snapshot.project_invites) {
    if (!projectOwners.has(String(invitation.project_id))) issues.push(`invite:${invitation.id}:missing-project`);
    if (!userIds.has(String(invitation.invited_by))) issues.push(`invite:${invitation.id}:missing-inviter`);
  }
  const auditIds = new Set<string>();
  for (const row of [...snapshot.audit_logs, ...snapshot.platform_audit_events]) {
    const id = String(row.id);
    if (auditIds.has(id)) issues.push(`audit:${id}:duplicate-cross-table-id`);
    auditIds.add(id);
  }
  return issues;
}

function organizationId(userId: string): string {
  return opaqueId("org", userId);
}

function membershipId(organization: string, userId: string): string {
  return opaqueId("mem", `${organization}:${userId}`);
}

function roleId(organization: string, role: string): string {
  return opaqueId("role", `${organization}:${role}`);
}

async function runStep(
  client: pg.Client,
  runId: string,
  stepKey: string,
  rows: Row[],
  action: () => Promise<void>,
): Promise<void> {
  const sourceHash = rowsHash(rows);
  const previous = await client.query<{ status: string; source_hash: string }>(
    "SELECT status, source_hash FROM public.platform_import_steps WHERE run_id=$1 AND step_key=$2",
    [runId, stepKey],
  );
  if (previous.rows[0]?.status === "completed") {
    if (previous.rows[0].source_hash !== sourceHash) throw new Error(`IMPORT_SOURCE_CHANGED:${stepKey}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO public.platform_import_steps (run_id,step_key,source_hash,status,source_rows)
       VALUES ($1,$2,$3,'running',$4)
       ON CONFLICT (run_id,step_key) DO UPDATE SET source_hash=excluded.source_hash,status='running',source_rows=excluded.source_rows,error_class=NULL`,
      [runId, stepKey, sourceHash, rows.length],
    );
    await action();
    await client.query(
      "UPDATE public.platform_import_steps SET status='completed',target_rows=$3,completed_at=now() WHERE run_id=$1 AND step_key=$2",
      [runId, stepKey, rows.length],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    await client.query(
      `INSERT INTO public.platform_import_steps (run_id,step_key,source_hash,status,source_rows,error_class)
       VALUES ($1,$2,$3,'failed',$4,$5)
       ON CONFLICT (run_id,step_key) DO UPDATE SET status='failed',error_class=excluded.error_class`,
      [runId, stepKey, sourceHash, rows.length, error instanceof Error ? error.name : "UnknownError"],
    );
    throw error;
  }
}

async function importIdentity(client: pg.Client, snapshot: SourceSnapshot, runId: string): Promise<void> {
  await runStep(client, runId, "identity", snapshot.users, async () => {
    for (const user of snapshot.users) {
      const userId = String(user.id);
      const organization = organizationId(userId);
      const ownerRole = roleId(organization, "owner");
      const membership = membershipId(organization, userId);
      await client.query(
        `INSERT INTO identity.accounts
          (id,email,display_name,password_hash,status,verified_at,last_login_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [userId, user.email, user.name, user.password_hash, user.status, epoch(user.email_verified_at), epoch(user.last_login_at), epoch(user.created_at), epoch(user.updated_at)],
      );
      await client.query(
        `INSERT INTO identity.organizations
          (id,slug,name,status,default_locale,timezone,owner_account_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'zh-CN','Asia/Shanghai',$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [organization, `workspace-${sha256(userId).slice(0, 12)}`, `${user.name} Workspace`, user.plan === "trial" ? "trial" : "active", userId, epoch(user.created_at), epoch(user.updated_at)],
      );
      await client.query(
        `INSERT INTO identity.roles (id,organization_id,role_key,name,permissions,is_system)
         VALUES ($1,$2,'owner','Owner','["*"]'::jsonb,true) ON CONFLICT (id) DO NOTHING`,
        [ownerRole, organization],
      );
      await client.query(
        `INSERT INTO identity.memberships (id,organization_id,account_id,role_id,status,joined_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'active',$5,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [membership, organization, userId, ownerRole, epoch(user.created_at), epoch(user.updated_at)],
      );
      await client.query(
        `INSERT INTO commerce.entitlements
          (id,organization_id,entitlement_key,value,source_type,source_version,valid_from,valid_until,created_at,updated_at)
         VALUES ($1,$2,'plan.current',$3::jsonb,$4,$5,$6,$7,$6,$6) ON CONFLICT (id) DO NOTHING`,
        [opaqueId("ent", `${organization}:plan.current`), organization, JSON.stringify({ planKey: user.plan }), user.plan === "trial" ? "trial" : "plan", String(user.plan), epoch(user.created_at), epoch(user.trial_ends_at)],
      );
    }
  });
}

async function ensureMemberRole(client: pg.Client, organization: string, userId: string, legacyRole: string): Promise<void> {
  const normalizedRole = legacyRole === "admin" ? "admin" : legacyRole;
  const role = roleId(organization, normalizedRole);
  await client.query(
    `INSERT INTO identity.roles (id,organization_id,role_key,name,permissions,is_system)
     VALUES ($1,$2,$3,$3,'[]'::jsonb,true) ON CONFLICT (id) DO NOTHING`,
    [role, organization, normalizedRole],
  );
  await client.query(
    `INSERT INTO identity.memberships (id,organization_id,account_id,role_id,status,joined_at)
     VALUES ($1,$2,$3,$4,'active',now()) ON CONFLICT (organization_id,account_id) DO NOTHING`,
    [membershipId(organization, userId), organization, userId, role],
  );
}

async function importProjects(client: pg.Client, snapshot: SourceSnapshot, runId: string): Promise<void> {
  const rows = [...snapshot.projects, ...snapshot.project_members, ...snapshot.project_invites];
  const ownerByProject = new Map(snapshot.projects.map((row) => [String(row.id), String(row.user_id)]));
  await runStep(client, runId, "projects", rows, async () => {
    for (const project of snapshot.projects) {
      const projectId = String(project.id);
      const ownerId = String(project.user_id);
      const organization = organizationId(ownerId);
      await client.query(
        `INSERT INTO project_governance.projects
          (id,organization_id,slug,name,canonical_url,canonical_host,locale,market,timezone,goals,approval_mode,created_by_account_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        [projectId, organization, String(project.host).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || projectId, project.name, project.site_url, project.host, project.language === "en" ? "en" : "zh-CN", project.market, project.timezone, JSON.stringify([project.business_goal]), project.approval_mode === "required" ? "manual" : "risk_based", ownerId, epoch(project.created_at), epoch(project.updated_at)],
      );
      await client.query(
        `INSERT INTO project_governance.project_access
          (id,organization_id,project_id,membership_id,access_level,granted_by_account_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'manager',$5,$6,$7) ON CONFLICT (project_id,membership_id) DO NOTHING`,
        [opaqueId("access", `${projectId}:${ownerId}`), organization, projectId, membershipId(organization, ownerId), ownerId, epoch(project.created_at), epoch(project.updated_at)],
      );
    }
    for (const member of snapshot.project_members) {
      const ownerId = ownerByProject.get(String(member.project_id))!;
      const organization = organizationId(ownerId);
      const userId = String(member.user_id);
      await ensureMemberRole(client, organization, userId, String(member.role));
      await client.query(
        `INSERT INTO project_governance.project_access
          (id,organization_id,project_id,membership_id,access_level,granted_by_account_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (project_id,membership_id) DO NOTHING`,
        [opaqueId("access", `${member.project_id}:${userId}`), organization, member.project_id, membershipId(organization, userId), ["admin", "seo_manager", "content_manager"].includes(String(member.role)) ? "manager" : String(member.role) === "viewer" ? "viewer" : "contributor", ownerId, epoch(member.created_at), epoch(member.updated_at)],
      );
    }
    for (const invitation of snapshot.project_invites) {
      const ownerId = ownerByProject.get(String(invitation.project_id))!;
      const organization = organizationId(ownerId);
      const role = roleId(organization, String(invitation.role));
      await client.query(
        `INSERT INTO identity.roles (id,organization_id,role_key,name,permissions,is_system)
         VALUES ($1,$2,$3,$3,'[]'::jsonb,true) ON CONFLICT (id) DO NOTHING`,
        [role, organization, invitation.role],
      );
      await client.query(
        `INSERT INTO identity.invitations
          (id,organization_id,email,role_id,token_hash,status,invited_by_account_id,expires_at,project_scope,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [invitation.id, organization, invitation.email, role, sha256(`legacy-invite:${invitation.id}`), invitation.status, invitation.invited_by, epoch(invitation.expires_at), JSON.stringify([invitation.project_id]), epoch(invitation.created_at), epoch(invitation.updated_at)],
      );
    }
  });
}

async function importSessions(client: pg.Client, snapshot: SourceSnapshot, runId: string): Promise<void> {
  await runStep(client, runId, "sessions", snapshot.sessions, async () => {
    for (const session of snapshot.sessions) {
      const userId = String(session.user_id);
      const organization = organizationId(userId);
      await client.query(
        `INSERT INTO identity.sessions
          (id,account_id,active_organization_id,membership_id,token_hash,status,expires_at,correlation_id,created_at)
         VALUES ($1,$2,$3,$4,$1,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [session.id, userId, organization, membershipId(organization, userId), Number(session.expires_at) <= Math.floor(Date.now() / 1000) ? "expired" : "active", epoch(session.expires_at), `migration:${runId}:session:${session.id}`, epoch(session.created_at)],
      );
    }
  });
}

async function importOperations(client: pg.Client, snapshot: SourceSnapshot, runId: string): Promise<void> {
  const rows = [...snapshot.audit_logs, ...snapshot.platform_audit_events, ...snapshot.platform_feature_flags];
  const users = new Set(snapshot.users.map((row) => String(row.id)));
  await runStep(client, runId, "operations", rows, async () => {
    for (const audit of snapshot.audit_logs) {
      const userId = audit.user_id ? String(audit.user_id) : null;
      await client.query(
        `INSERT INTO operations.audit_events
          (id,organization_id,actor_type,actor_id,action,target_type,outcome,correlation_id,metadata,occurred_at)
         VALUES ($1,$2,$3,$4,$5,'legacy',$6,$7,$8::jsonb,$9) ON CONFLICT (id) DO NOTHING`,
        [audit.id, userId && users.has(userId) ? organizationId(userId) : null, userId ? "user" : "system", userId, audit.action, "success", `migration:${runId}:audit:${audit.id}`, JSON.stringify({ legacyDetail: audit.detail ?? null, legacyIp: audit.ip ?? null }), epoch(audit.created_at)],
      );
    }
    for (const audit of snapshot.platform_audit_events) {
      await client.query(
        `INSERT INTO operations.audit_events
          (id,organization_id,actor_type,actor_id,action,target_type,target_id,outcome,reason,correlation_id,metadata,occurred_at)
         VALUES ($1,$2,'system',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) ON CONFLICT (id) DO NOTHING`,
        [audit.id, audit.organization_id, audit.actor_id, audit.action, audit.target_type, audit.target_id, audit.outcome === "failure" ? "failed" : "success", audit.reason, audit.correlation_id, JSON.stringify({ legacyDetail: audit.detail ?? null }), epoch(audit.created_at)],
      );
    }
    for (const flag of snapshot.platform_feature_flags) {
      const scope = String(flag.scope);
      const scopeValue = String(flag.scope_value);
      await client.query(
        `INSERT INTO operations.feature_flags
          (id,flag_key,environment,organization_id,project_id,plan_key,cohort_key,capability_key,agent_key,enabled,active,reason,changed_by,version,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,'Migrated from SQLite','migration',$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [flag.id, flag.flag_key, scope === "environment" ? scopeValue : "production", scope === "organization" ? (users.has(scopeValue) ? organizationId(scopeValue) : scopeValue) : null, scope === "project" ? scopeValue : null, scope === "plan" ? scopeValue : null, scope === "capability" ? scopeValue : null, scope === "agent" ? scopeValue : null, Boolean(flag.enabled), Boolean(flag.active), flag.version, epoch(flag.created_at), epoch(flag.updated_at)],
      );
    }
  });
}

async function targetIds(client: pg.Client, table: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const result = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ANY($1::text[]) ORDER BY id`, [ids]);
  return result.rows.map((row) => row.id);
}

async function createReport(
  client: pg.Client,
  snapshot: SourceSnapshot,
  runId: string,
  sourceSnapshotHash: string,
  sourceFileHash: string,
) {
  const accounts = snapshot.users.map((row) => String(row.id));
  const projects = snapshot.projects.map((row) => String(row.id));
  const sessions = snapshot.sessions.map((row) => String(row.id));
  const auditEvents = [...snapshot.audit_logs, ...snapshot.platform_audit_events].map((row) => String(row.id));
  const entities = [];
  for (const [name, table, ids] of [
    ["accounts", "identity.accounts", accounts],
    ["projects", "project_governance.projects", projects],
    ["sessions", "identity.sessions", sessions],
    ["audit_events", "operations.audit_events", auditEvents],
  ] as const) {
    const target = await targetIds(client, table, ids);
    entities.push({ name, sourceRows: ids.length, targetRows: target.length, sourceIdHash: idsHash(ids), targetIdHash: idsHash(target) });
  }
  const ownership = await client.query<{ mismatches: string }>(`
    SELECT count(*)::text AS mismatches
    FROM project_governance.projects p
    LEFT JOIN identity.organizations o ON o.id=p.organization_id
    WHERE o.id IS NULL OR p.created_by_account_id<>o.owner_account_id
  `);
  return {
    schemaVersion: 1,
    runId,
    sourceFileHash,
    sourceSnapshotHash,
    generatedAt: new Date().toISOString(),
    sourceTables: Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, { rows: rows.length, hash: rowsHash(rows) }])),
    entities,
    ownershipValidation: { passed: ownership.rows[0]?.mismatches === "0", mismatches: Number(ownership.rows[0]?.mismatches ?? 0) },
  };
}

async function persistReport(client: pg.Client, report: Awaited<ReturnType<typeof createReport>>, reportDirectory: string) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const reportHash = sha256(serialized);
  const reportId = opaqueId("report", report.runId);
  const inserted = await client.query<{ report_hash: string }>(
    `INSERT INTO public.platform_import_reports (id,run_id,report_hash,report)
     VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (run_id) DO NOTHING RETURNING report_hash`,
    [reportId, report.runId, reportHash, serialized],
  );
  await mkdir(reportDirectory, { recursive: true });
  if (inserted.rows.length === 0) {
    const existing = await client.query<{ report_hash: string }>(
      "SELECT report_hash FROM public.platform_import_reports WHERE run_id=$1",
      [report.runId],
    );
    const existingHash = existing.rows[0]?.report_hash;
    if (!existingHash) throw new Error("IMPORT_REPORT_STATE_MISSING");
    const existingFilename = path.join(reportDirectory, `${report.runId}-${existingHash.slice(0, 12)}.json`);
    await readFile(existingFilename, "utf8");
    return { filename: existingFilename, reportHash: existingHash };
  }
  const filename = path.join(reportDirectory, `${report.runId}-${reportHash.slice(0, 12)}.json`);
  try {
    await writeFile(filename, serialized, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || (await readFile(filename, "utf8")) !== serialized) throw error;
  }
  return { filename, reportHash };
}

const command = process.argv[2] ?? "dry-run";
if (command !== "dry-run" && command !== "apply") throw new Error("Use dry-run or apply.");
const sqlitePath = process.env.SQLITE_SOURCE_PATH;
if (!sqlitePath) throw new Error("SQLITE_SOURCE_PATH is required.");

const snapshot = readSnapshot(sqlitePath);
const sourceFileHash = await fileHash(sqlitePath);
const sourceSnapshotHash = sha256(stable(snapshot));
const ownershipIssues = validateOwnership(snapshot);
const summary = {
  command,
  sourceFileHash,
  sourceSnapshotHash,
  tables: Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, { rows: rows.length, hash: rowsHash(rows) }])),
  ownershipIssues,
};
if (ownershipIssues.length > 0) throw new Error(`IMPORT_OWNERSHIP_VALIDATION_FAILED:${ownershipIssues.join(",")}`);
if (command === "dry-run") {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  process.exit(0);
}

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is required for apply.");
const runId = opaqueId("import", sourceSnapshotHash);
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO public.platform_import_runs (id,source_file_hash,source_label,status)
     VALUES ($1,$2,$3,'running')
     ON CONFLICT (source_file_hash) DO UPDATE SET status=CASE WHEN platform_import_runs.status='completed' THEN 'completed' ELSE 'running' END,error_class=NULL`,
    [runId, sourceSnapshotHash, path.basename(sqlitePath)],
  );
  await importIdentity(client, snapshot, runId);
  await importProjects(client, snapshot, runId);
  await importSessions(client, snapshot, runId);
  await importOperations(client, snapshot, runId);
  const report = await createReport(client, snapshot, runId, sourceSnapshotHash, sourceFileHash);
  if (!report.ownershipValidation.passed || report.entities.some((entity) => entity.sourceIdHash !== entity.targetIdHash)) {
    throw new Error("IMPORT_TARGET_VALIDATION_FAILED");
  }
  const persisted = await persistReport(client, report, process.env.MIGRATION_REPORT_DIR ?? path.join(process.cwd(), "outputs", "migration-reports"));
  await client.query("UPDATE public.platform_import_runs SET status='completed',completed_at=now() WHERE id=$1", [runId]);
  process.stdout.write(`${JSON.stringify({ ...summary, runId, reportHash: persisted.reportHash, reportFile: persisted.filename })}\n`);
} catch (error) {
  await client.query("UPDATE public.platform_import_runs SET status='failed',error_class=$2 WHERE id=$1", [runId, error instanceof Error ? error.name : "UnknownError"]);
  throw error;
} finally {
  await client.end();
}
