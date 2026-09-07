import type { AppDatabase } from "./database";

export class ContentVersionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

export function ensureContentVersionSchema(db: AppDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS content_versions(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES content_runs(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,body TEXT NOT NULL,word_count INTEGER NOT NULL DEFAULT 0,
    created_by_account_id TEXT NOT NULL,created_at INTEGER NOT NULL,
    UNIQUE(project_id,run_id,version_number));
    CREATE INDEX IF NOT EXISTS content_versions_scope_idx
    ON content_versions(organization_id,project_id,run_id,version_number DESC);`);
}

export function saveContentVersion(db: AppDatabase, input: {
  organizationId: string; projectId: string; runId: string; accountId: string;
  body: string; expectedVersion: number;
}) {
  if (!input.body.trim() || input.body.length > 200000 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new ContentVersionError("CONTENT_VERSION_INVALID", "正文不能为空或超过 20 万字符，且必须提供当前版本", 400);
  }
  ensureContentVersionSchema(db);
  // The version check and insert share a write transaction, including across processes.
  return db.transaction(() => {
    const run = db.prepare(`SELECT cr.id FROM content_runs cr JOIN projects p ON p.id=cr.project_id
      WHERE cr.id=? AND cr.project_id=? AND p.organization_id=? AND p.status='active' AND cr.status='completed'`)
      .bind(input.runId, input.projectId, input.organizationId).first();
    if (!run) throw new ContentVersionError("CONTENT_VERSION_NOT_FOUND", "内容不存在、未生成完成或项目已停用", 404);
    const latest = Number(db.prepare(`SELECT COALESCE(MAX(version_number),0) AS value FROM content_versions
      WHERE organization_id=? AND project_id=? AND run_id=?`)
      .bind(input.organizationId, input.projectId, input.runId).first<{value:number}>()?.value ?? 0);
    if (latest !== input.expectedVersion) {
      throw new ContentVersionError("CONTENT_VERSION_CONFLICT", "已有更新版本，当前正文尚未保存。请先复制正文，再刷新并合并修改", 409);
    }
    const version = {
      id: crypto.randomUUID(), runId: input.runId, versionNumber: latest + 1, body: input.body,
      wordCount: input.body.replace(/[#>*_`\[\]()\-]/g, " ").trim().split(/\s+|(?=[\u4e00-\u9fff])/).filter(Boolean).length,
      createdAt: Math.floor(Date.now() / 1000),
    };
    db.prepare(`INSERT INTO content_versions(id,organization_id,project_id,run_id,version_number,body,word_count,created_by_account_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(version.id, input.organizationId, input.projectId, input.runId,
      version.versionNumber, version.body, version.wordCount, input.accountId, version.createdAt).run();
    return version;
  });
}
