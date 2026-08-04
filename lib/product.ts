import { ensureAuthSchema, getDatabase, type AppUser } from "./auth";

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
  ] as const) {
    if (!existing.has(name)) database.exec(`ALTER TABLE audit_runs ADD COLUMN ${name} ${definition}`);
  }
}

export function normalizeProjectUrl(value: string): { siteUrl: string; host: string } {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) throw new Error("INVALID_SITE_URL");
  const candidate = value.match(/^https?:\/\//i) ? value : `https://${value}`;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("INVALID_SITE_URL");
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return { siteUrl: parsed.toString(), host: parsed.hostname.toLowerCase() };
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

export async function ownedProject(userId: string, projectId: string): Promise<Project | null> {
  await ensureProductSchema();
  return getDatabase().prepare(`
    SELECT id, user_id AS userId, name, site_url AS siteUrl, host, market, language, timezone,
           business_goal AS businessGoal, approval_mode AS approvalMode,
           schedule_enabled AS scheduleEnabled, created_at AS createdAt, updated_at AS updatedAt
    FROM projects WHERE id = ? AND user_id = ? LIMIT 1
  `).bind(projectId, userId).first<Project>();
}

export const connectionProviders = ["public_crawl", "google_search_console", "google_analytics_4", "rank_provider", "cms"] as const;
