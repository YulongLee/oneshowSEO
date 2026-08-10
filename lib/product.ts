import { ensureAuthSchema, getDatabase, type AppUser } from "./auth";
import { canonicalProjectUrl } from "../platform/modules/projects/governance";

export type Project = {
  id: string;
  userId: string;
  name: string;
  siteUrl: string;
  host: string;
  market: string;
  language: string;
  timezone: string;
  businessGoal: string;
  approvalMode: "required" | "low_risk_auto";
  scheduleEnabled: number;
  organizationId: string;
  slug: string;
  status: "active" | "archived" | "pending_deletion";
  businessType: string;
  searchEngines: string[];
  version: number;
  archivedAt: number | null;
  deletionRequestedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export async function ensureProductSchema(): Promise<void> {
  const database = getDatabase();
  await ensureAuthSchema(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      site_url TEXT NOT NULL,
      host TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'CN',
      language TEXT NOT NULL DEFAULT 'zh-CN',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      business_goal TEXT NOT NULL DEFAULT 'organic_growth',
      approval_mode TEXT NOT NULL DEFAULT 'required' CHECK(approval_mode IN ('required','low_risk_auto')),
      schedule_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, host)
    );
    CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS project_connections (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','connected','error')),
      connected_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, provider)
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('admin','seo_manager','content_manager','editor','writer','analyst','viewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id, status);
    CREATE TABLE IF NOT EXISTS project_teams (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(organization_id,project_id,name)
    );
    CREATE INDEX IF NOT EXISTS project_teams_org_project_idx ON project_teams(organization_id,project_id,status,updated_at);
    CREATE TABLE IF NOT EXISTS project_team_members (
      team_id TEXT NOT NULL REFERENCES project_teams(id) ON DELETE CASCADE,
      membership_id TEXT NOT NULL REFERENCES identity_memberships(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(team_id,membership_id)
    );
    CREATE INDEX IF NOT EXISTS project_team_members_membership_idx ON project_team_members(membership_id,team_id);
    CREATE TABLE IF NOT EXISTS project_access (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      membership_id TEXT NOT NULL REFERENCES identity_memberships(id) ON DELETE CASCADE,
      access_level TEXT NOT NULL CHECK(access_level IN ('manager','editor','contributor','viewer')),
      granted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id,membership_id)
    );
    CREATE INDEX IF NOT EXISTS project_access_org_member_idx ON project_access(organization_id,membership_id);
    CREATE INDEX IF NOT EXISTS project_access_org_project_idx ON project_access(organization_id,project_id);
    CREATE TABLE IF NOT EXISTS team_activity_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS team_activity_org_project_idx ON team_activity_events(organization_id,project_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS project_invites (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','seo_manager','content_manager','editor','writer','analyst','viewer')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
      invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_invites_pending_idx ON project_invites(project_id, email) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS audit_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
      score INTEGER,
      pages_scanned INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS audit_runs_project_idx ON audit_runs(project_id, started_at);
    CREATE TABLE IF NOT EXISTS audit_pages (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      title TEXT,
      description TEXT,
      canonical TEXT,
      h1_count INTEGER NOT NULL DEFAULT 0,
      images_without_alt INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS audit_checks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      check_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pass','warning','fail','unknown','skipped')),
      severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
      confidence TEXT NOT NULL CHECK(confidence IN ('confirmed','likely','hypothesis')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT,
      impact TEXT,
      recommendation TEXT,
      url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_checks_run_idx ON audit_checks(run_id, category, status);
    CREATE TABLE IF NOT EXISTS audit_evidence (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('public','integration','artifact')),
      source_ref TEXT NOT NULL,
      summary TEXT NOT NULL,
      digest TEXT NOT NULL,
      confidence REAL NOT NULL,
      captured_at INTEGER NOT NULL,
      fresh_until INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(run_id,digest)
    );
    CREATE INDEX IF NOT EXISTS audit_evidence_project_idx ON audit_evidence(project_id,captured_at);
    CREATE TABLE IF NOT EXISTS audit_category_scores (
      run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      score INTEGER,
      confidence TEXT NOT NULL,
      checks_total INTEGER NOT NULL,
      checks_known INTEGER NOT NULL,
      PRIMARY KEY(run_id, category)
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','ignored')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS findings_project_idx ON findings(project_id, status, severity);
    CREATE TABLE IF NOT EXISTS seo_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','running','completed','failed','dismissed')),
      requires_approval INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS seo_tasks_project_idx ON seo_tasks(project_id, status, priority);
    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
      opportunities_found INTEGER NOT NULL DEFAULT 0,
      content_ideas INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS research_runs_project_idx ON research_runs(project_id, started_at);
    CREATE TABLE IF NOT EXISTS research_opportunities (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      keyword TEXT NOT NULL,
      intent TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      priority INTEGER NOT NULL,
      search_volume INTEGER,
      keyword_difficulty INTEGER,
      potential_traffic INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS research_opportunities_project_idx ON research_opportunities(project_id, created_at);
    CREATE TABLE IF NOT EXISTS research_evidence (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('public','integration','artifact')),
      source_ref TEXT NOT NULL,
      summary TEXT NOT NULL,
      digest TEXT NOT NULL,
      confidence REAL NOT NULL,
      captured_at INTEGER NOT NULL,
      fresh_until INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(run_id,digest)
    );
    CREATE INDEX IF NOT EXISTS research_evidence_project_idx ON research_evidence(project_id,captured_at);
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_user_idx ON usage_events(user_id, metric, created_at);
  `);
  const runColumns = database.prepare("PRAGMA table_info(audit_runs)").all().results as Array<{name:string}>;
  const existing = new Set(runColumns.map((column) => column.name));
  for (const [name, definition] of [
    ["urls_discovered", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_total", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_passed", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_warning", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_failed", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_unknown", "INTEGER NOT NULL DEFAULT 0"],
    ["checks_skipped", "INTEGER NOT NULL DEFAULT 0"],
    ["execution_task_id", "TEXT"],
    ["evidence_count", "INTEGER NOT NULL DEFAULT 0"],
    ["coverage_status", "TEXT NOT NULL DEFAULT 'complete'"],
    ["partial_reasons", "TEXT NOT NULL DEFAULT '[]'"],
    ["degraded_sources", "TEXT NOT NULL DEFAULT '[]'"],
    ["agent_version", "TEXT NOT NULL DEFAULT '1.0.0'"],
  ] as const) {
    if (!existing.has(name)) database.exec(`ALTER TABLE audit_runs ADD COLUMN ${name} ${definition}`);
  }
  const auditCheckColumns=database.prepare("PRAGMA table_info(audit_checks)").all().results as Array<{name:string}>;const auditCheckExisting=new Set(auditCheckColumns.map(column=>column.name));
  if(!auditCheckExisting.has("evidence_refs"))database.exec("ALTER TABLE audit_checks ADD COLUMN evidence_refs TEXT NOT NULL DEFAULT '[]'");
  const findingColumns=database.prepare("PRAGMA table_info(findings)").all().results as Array<{name:string}>;const findingExisting=new Set(findingColumns.map(column=>column.name));
  if(!findingExisting.has("evidence_refs"))database.exec("ALTER TABLE findings ADD COLUMN evidence_refs TEXT NOT NULL DEFAULT '[]'");
  if(!findingExisting.has("confidence"))database.exec("ALTER TABLE findings ADD COLUMN confidence REAL NOT NULL DEFAULT 0");
  const researchRunColumns = database.prepare("PRAGMA table_info(research_runs)").all().results as Array<{name:string}>;
  const researchRunExisting = new Set(researchRunColumns.map((column) => column.name));
  for (const [name, definition] of [
    ["execution_task_id", "TEXT"],
    ["source_count", "INTEGER NOT NULL DEFAULT 0"],
    ["evidence_count", "INTEGER NOT NULL DEFAULT 0"],
    ["degraded_sources", "TEXT NOT NULL DEFAULT '[]'"],
    ["agent_version", "TEXT NOT NULL DEFAULT '1.0.0'"],
  ] as const) if (!researchRunExisting.has(name)) database.exec(`ALTER TABLE research_runs ADD COLUMN ${name} ${definition}`);
  const researchOpportunityColumns = database.prepare("PRAGMA table_info(research_opportunities)").all().results as Array<{name:string}>;
  const researchOpportunityExisting = new Set(researchOpportunityColumns.map((column) => column.name));
  for (const [name, definition] of [
    ["evidence_refs", "TEXT NOT NULL DEFAULT '[]'"],
    ["confidence", "REAL NOT NULL DEFAULT 0"],
  ] as const) if (!researchOpportunityExisting.has(name)) database.exec(`ALTER TABLE research_opportunities ADD COLUMN ${name} ${definition}`);
  const projectColumns = database.prepare("PRAGMA table_info(projects)").all().results as Array<{name:string}>;
  const projectExisting = new Set(projectColumns.map((column) => column.name));
  for (const [name, definition] of [
    ["organization_id", "TEXT"],
    ["slug", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["business_type", "TEXT NOT NULL DEFAULT 'website'"],
    ["search_engines", "TEXT NOT NULL DEFAULT '[\"google\",\"bing\"]'"],
    ["enabled_capabilities", "TEXT NOT NULL DEFAULT '[]'"],
    ["version", "INTEGER NOT NULL DEFAULT 1"],
    ["archived_at", "INTEGER"],
    ["deletion_requested_at", "INTEGER"],
    ["deletion_reason", "TEXT"],
  ] as const) {
    if (!projectExisting.has(name)) database.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
  }
  database.exec(`
    UPDATE projects SET organization_id=COALESCE(organization_id,'org_'||user_id), slug=COALESCE(slug,lower(replace(host,'.','-'))||'-'||substr(replace(id,'-',''),1,8));
    CREATE INDEX IF NOT EXISTS projects_organization_status_idx ON projects(organization_id,status,updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS projects_organization_slug_idx ON projects(organization_id,slug);
    CREATE UNIQUE INDEX IF NOT EXISTS projects_organization_host_active_idx ON projects(organization_id,host) WHERE status!='pending_deletion';
  `);
}

export function normalizeProjectUrl(value: string): { siteUrl: string; host: string } {
  try { return canonicalProjectUrl(value); } catch { throw new Error("INVALID_SITE_URL"); }
}

export function projectLimit(user: AppUser): number {
  return { trial: 1, starter: 3, pro: 10, business: 100 }[user.plan];
}

export function pageLimit(user: AppUser): number {
  return { trial: 10, starter: 50, pro: 250, business: 1000 }[user.plan];
}

export function teamSeatLimit(user: AppUser): number {
  return { trial: 1, starter: 3, pro: 15, business: 100 }[user.plan];
}

export async function ownedProject(organizationId: string, projectId: string): Promise<Project | null> {
  await ensureProductSchema();
  const row = getDatabase().prepare(`
    SELECT id, user_id AS userId, organization_id AS organizationId, slug, status, name, site_url AS siteUrl, host, market, language, timezone,
           business_goal AS businessGoal, approval_mode AS approvalMode,
           business_type AS businessType, search_engines AS searchEnginesJson, version, archived_at AS archivedAt,
           deletion_requested_at AS deletionRequestedAt, schedule_enabled AS scheduleEnabled, created_at AS createdAt, updated_at AS updatedAt
    FROM projects WHERE id = ? AND organization_id = ? LIMIT 1
  `).bind(projectId, organizationId).first<Project & {searchEnginesJson:string}>();
  if (!row) return null;
  let searchEngines: string[] = [];
  try { searchEngines = JSON.parse(row.searchEnginesJson) as string[]; } catch { searchEngines = []; }
  const { searchEnginesJson: _searchEnginesJson, ...project } = row;
  void _searchEnginesJson;
  return { ...project, searchEngines };
}

export const connectionProviders = ["public_crawl", "google_search_console", "google_analytics_4", "rank_provider", "cms"] as const;
