import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../lib/auth";
import { connectionProviders, ensureProductSchema, ownedProject, projectLimit } from "../../../lib/product";
import { can, permissions, type OrganizationRoleKey } from "../../../platform/modules/identity/authorization";
import {
  assertDeletionConfirmation,
  assertProjectVersion,
  normalizeProjectSettings,
  projectSlug,
  ProjectGovernanceError,
} from "../../../platform/modules/projects/governance";

function forbidden() { return NextResponse.json({ error: "没有执行此操作的权限" }, { status: 403 }); }
function role(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): OrganizationRoleKey { return user.organization.roleKey as OrganizationRoleKey; }
function failure(error: unknown) {
  if (error instanceof ProjectGovernanceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) return NextResponse.json({ error: "该网站已在当前组织的项目中", code: "CONFLICT" }, { status: 409 });
  return NextResponse.json({ error: "项目操作失败，请稍后重试" }, { status: 500 });
}

const projectSelect = `SELECT id,name,site_url AS siteUrl,host,market,language,timezone,business_goal AS businessGoal,
  approval_mode AS approvalMode,schedule_enabled AS scheduleEnabled,business_type AS businessType,
  search_engines AS searchEnginesJson,status,version,slug,archived_at AS archivedAt,
  deletion_requested_at AS deletionRequestedAt,created_at AS createdAt,updated_at AS updatedAt`;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!can(role(user), permissions.projectsRead)) return forbidden();
  await ensureProductSchema();
  const rows = getDatabase().prepare(`${projectSelect} FROM projects WHERE organization_id=? ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'archived' THEN 2 ELSE 3 END,updated_at DESC`)
    .bind(user.organization.organizationId).all<Record<string, unknown>>().results;
  const projects = rows.map(({searchEnginesJson, ...item}) => ({...item, searchEngines: JSON.parse(String(searchEnginesJson || "[]"))}));
  return NextResponse.json({ projects, limit: projectLimit(user) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!can(role(user), permissions.projectsCreate)) return forbidden();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new ProjectGovernanceError("INVALID_REQUEST", "项目参数无效", 400);
    const settings = normalizeProjectSettings(body);
    await ensureProductSchema();
    const db = getDatabase();
    const organizationId = user.organization.organizationId;
    const count = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE organization_id=? AND status!='pending_deletion'").bind(organizationId).first<{count:number}>()?.count || 0;
    if (count >= projectLimit(user)) throw new ProjectGovernanceError("LIMIT_REACHED", `当前套餐最多创建 ${projectLimit(user)} 个项目`, 403);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const slug = projectSlug(settings.host, id);
    const statements = [db.prepare(`INSERT INTO projects
      (id,user_id,organization_id,slug,status,name,site_url,host,market,language,timezone,business_goal,approval_mode,schedule_enabled,business_type,search_engines,version,created_at,updated_at)
      VALUES (?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
      .bind(id,user.id,organizationId,slug,settings.name,settings.siteUrl,settings.host,settings.market,settings.language,settings.timezone,settings.businessGoal,settings.approvalMode,settings.scheduleEnabled,settings.businessType,JSON.stringify(settings.searchEngines),now,now)];
    for (const provider of connectionProviders) statements.push(db.prepare("INSERT INTO project_connections (project_id,provider,status,updated_at) VALUES (?,?,?,?)").bind(id,provider,provider === "public_crawl" ? "connected" : "disconnected",now));
    db.batch(statements);
    await writeAudit("project_created", user.id, request, JSON.stringify({ projectId:id, organizationId, host:settings.host, version:1 }));
    return NextResponse.json({ project: { id, organizationId, slug, status:"active", version:1, ...settings, createdAt:now, updatedAt:now } }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!can(role(user), permissions.projectsUpdate)) return forbidden();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = String(body?.id || "");
    const current = id ? await ownedProject(user.organization.organizationId, id) : null;
    if (!current || current.organizationId !== user.organization.organizationId) throw new ProjectGovernanceError("NOT_FOUND", "项目不存在或无权访问", 404);
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const action = String(body?.action || "update");
    if (action === "archive" || action === "restore") {
      assertProjectVersion(body?.version, current.version);
      const nextStatus = action === "archive" ? "archived" : "active";
      const result = db.prepare(`UPDATE projects SET status=?,archived_at=?,schedule_enabled=CASE WHEN ?='archived' THEN 0 ELSE schedule_enabled END,version=version+1,updated_at=? WHERE id=? AND organization_id=? AND version=?`)
        .bind(nextStatus,nextStatus === "archived" ? now : null,nextStatus,now,id,current.organizationId,current.version).run();
      if (!result.meta.changes) throw new ProjectGovernanceError("CONFLICT", "项目状态已变化，请刷新后重试", 409);
      await writeAudit(`project_${action}d`, user.id, request, JSON.stringify({projectId:id, organizationId:current.organizationId, from:current.status, to:nextStatus, version:current.version+1}));
      return NextResponse.json({ ok:true, status:nextStatus, version:current.version+1, updatedAt:now });
    }
    if (current.status !== "active") throw new ProjectGovernanceError("CONFLICT", "只有活跃项目可以修改设置", 409);
    assertProjectVersion(body?.version, current.version);
    const settings = normalizeProjectSettings(body || {}, current);
    const result = db.prepare(`UPDATE projects SET name=?,site_url=?,host=?,market=?,language=?,timezone=?,business_goal=?,approval_mode=?,schedule_enabled=?,business_type=?,search_engines=?,version=version+1,updated_at=? WHERE id=? AND organization_id=? AND version=?`)
      .bind(settings.name,settings.siteUrl,settings.host,settings.market,settings.language,settings.timezone,settings.businessGoal,settings.approvalMode,settings.scheduleEnabled,settings.businessType,JSON.stringify(settings.searchEngines),now,id,current.organizationId,current.version).run();
    if (!result.meta.changes) throw new ProjectGovernanceError("CONFLICT", "项目已被其他成员更新，请刷新后重试", 409);
    await writeAudit("project_updated", user.id, request, JSON.stringify({ projectId:id, organizationId:current.organizationId, version:current.version+1, fields:["name","siteUrl","market","language","timezone","businessGoal","approvalMode","scheduleEnabled","businessType","searchEngines"] }));
    return NextResponse.json({ project: { id,organizationId:current.organizationId,slug:current.slug,status:current.status,version:current.version+1,...settings,createdAt:current.createdAt,updatedAt:now } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!can(role(user), permissions.projectsDelete)) return forbidden();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = String(body?.id || "");
    const current = id ? await ownedProject(user.organization.organizationId, id) : null;
    if (!current || current.organizationId !== user.organization.organizationId) throw new ProjectGovernanceError("NOT_FOUND", "项目不存在或无权访问", 404);
    assertProjectVersion(body?.version, current.version);
    assertDeletionConfirmation(body?.confirmation, current);
    const db = getDatabase();
    const running = db.prepare("SELECT COUNT(*) AS count FROM audit_runs WHERE project_id=? AND status='running'").bind(id).first<{count:number}>()?.count || 0;
    const externalWork = db.prepare("SELECT COUNT(*) AS count FROM seo_tasks WHERE project_id=? AND status IN ('approved','running')").bind(id).first<{count:number}>()?.count || 0;
    if (running || externalWork) throw new ProjectGovernanceError("DELETE_BLOCKED", `项目仍有 ${running + externalWork} 项运行中或已批准工作，请先完成或取消`, 409);
    const now = Math.floor(Date.now()/1000);
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 240) : "user_requested";
    const statements = [
      db.prepare("UPDATE projects SET status='pending_deletion',schedule_enabled=0,deletion_requested_at=?,deletion_reason=?,version=version+1,updated_at=? WHERE id=? AND organization_id=? AND version=?").bind(now,reason,now,id,current.organizationId,current.version),
      db.prepare("UPDATE project_connections SET status='disconnected',connected_at=NULL,updated_at=? WHERE project_id=?").bind(now,id),
    ];
    const [changed] = db.batch(statements);
    if (!changed.meta.changes) throw new ProjectGovernanceError("CONFLICT", "项目状态已变化，请刷新后重试", 409);
    await writeAudit("project_deletion_requested", user.id, request, JSON.stringify({ projectId:id, organizationId:current.organizationId, host:current.host, retention:"soft_delete", version:current.version+1 }));
    return NextResponse.json({ ok:true, status:"pending_deletion", retained:true, message:"项目已停用并进入安全保留期" });
  } catch (error) { return failure(error); }
}
