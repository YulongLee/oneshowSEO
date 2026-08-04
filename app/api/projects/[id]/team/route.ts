import { NextResponse } from "next/server";
import { consumeRateLimit, getCurrentUser, getDatabase, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema, ownedProject, teamSeatLimit } from "../../../../../lib/product";

const roles = new Set(["admin", "seo_manager", "content_manager", "editor", "writer", "analyst", "viewer"]);

async function owner(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await ownedProject(user.id, projectId);
  return project ? { user, project } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await owner(id);
  if (!access) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  await ensureProductSchema();
  const db = getDatabase();
  const members = db.prepare(`
    SELECT u.id,u.name,u.email,pm.role,pm.status,u.last_login_at AS lastActiveAt,pm.created_at AS joinedAt
    FROM project_members pm JOIN users u ON u.id=pm.user_id
    WHERE pm.project_id=? ORDER BY pm.created_at
  `).bind(id).all().results;
  const invites = db.prepare(`
    SELECT id,email,role,status,expires_at AS expiresAt,created_at AS createdAt
    FROM project_invites WHERE project_id=? AND status='pending' ORDER BY created_at DESC
  `).bind(id).all().results;
  return NextResponse.json({
    owner: { id: access.user.id, name: access.user.name, email: access.user.email, role: "owner", status: "active", lastActiveAt: Math.floor(Date.now()/1000), joinedAt: access.project.createdAt },
    members,
    invites,
    seats: { used: 1 + members.length, pending: invites.length, limit: teamSeatLimit(access.user) },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await owner(id);
  if (!access) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  if (await consumeRateLimit("team_invite", access.user.email, request, 10, 60 * 60)) return NextResponse.json({ error: "邀请过于频繁，请稍后再试" }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 254);
  const role = String(body?.role || "viewer");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
  if (!roles.has(role)) return NextResponse.json({ error: "角色无效" }, { status: 400 });
  if (email === access.user.email.toLowerCase()) return NextResponse.json({ error: "该账号已经是项目所有者" }, { status: 409 });
  await ensureProductSchema();
  const db = getDatabase();
  const seatsUsed = 1 + Number(db.prepare("SELECT COUNT(*) AS count FROM project_members WHERE project_id=? AND status='active'").bind(id).first<{count:number}>()?.count || 0);
  const pending = Number(db.prepare("SELECT COUNT(*) AS count FROM project_invites WHERE project_id=? AND status='pending'").bind(id).first<{count:number}>()?.count || 0);
  if (seatsUsed + pending >= teamSeatLimit(access.user)) return NextResponse.json({ error: "团队席位已用完，请先升级套餐或取消待处理邀请" }, { status: 403 });
  const existing = db.prepare(`SELECT 1 AS found FROM project_invites WHERE project_id=? AND email=? AND status='pending' LIMIT 1`).bind(id,email).first();
  if (existing) return NextResponse.json({ error: "该邮箱已有待处理邀请" }, { status: 409 });
  const existingMember = db.prepare(`SELECT 1 AS found FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND u.email=? LIMIT 1`).bind(id,email).first();
  if (existingMember) return NextResponse.json({ error: "该用户已经是项目成员" }, { status: 409 });
  const now = Math.floor(Date.now()/1000); const inviteId = crypto.randomUUID();
  await db.prepare(`INSERT INTO project_invites (id,project_id,email,role,status,invited_by,expires_at,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?,?,?)`)
    .bind(inviteId,id,email,role,access.user.id,now+7*24*60*60,now,now).run();
  await writeAudit("team_invite_created", access.user.id, request, JSON.stringify({ projectId:id, inviteId, email, role }));
  return NextResponse.json({ invite: { id:inviteId,email,role,status:"pending",expiresAt:now+7*24*60*60,createdAt:now } }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await owner(id);
  if (!access) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const memberId = String(body?.memberId || ""); const role = body?.role === undefined ? undefined : String(body.role); const status = body?.status === undefined ? undefined : String(body.status);
  if (!memberId) return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  if (role !== undefined && !roles.has(role)) return NextResponse.json({ error: "角色无效" }, { status: 400 });
  if (status !== undefined && !["active","suspended"].includes(status)) return NextResponse.json({ error: "状态无效" }, { status: 400 });
  const fields:string[]=[]; const values:unknown[]=[];
  if (role !== undefined) { fields.push("role=?"); values.push(role); }
  if (status !== undefined) { fields.push("status=?"); values.push(status); }
  if (!fields.length) return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  const now=Math.floor(Date.now()/1000); fields.push("updated_at=?"); values.push(now,id,memberId);
  const result=await getDatabase().prepare(`UPDATE project_members SET ${fields.join(",")} WHERE project_id=? AND user_id=?`).bind(...values).run();
  if (!result.meta.changes) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  await writeAudit("team_member_updated", access.user.id, request, JSON.stringify({ projectId:id, memberId, role, status }));
  return NextResponse.json({ ok:true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await owner(id);
  if (!access) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const inviteId=String(body?.inviteId||""); const memberId=String(body?.memberId||"");
  const db=getDatabase(); let changes=0; let action="";
  if (inviteId) { const result=await db.prepare("UPDATE project_invites SET status='cancelled',updated_at=? WHERE id=? AND project_id=? AND status='pending'").bind(Math.floor(Date.now()/1000),inviteId,id).run(); changes=result.meta.changes; action="team_invite_cancelled"; }
  else if (memberId) { const result=await db.prepare("DELETE FROM project_members WHERE project_id=? AND user_id=?").bind(id,memberId).run(); changes=result.meta.changes; action="team_member_removed"; }
  else return NextResponse.json({ error: "缺少目标" }, { status: 400 });
  if (!changes) return NextResponse.json({ error: "目标不存在或已处理" }, { status: 404 });
  await writeAudit(action, access.user.id, request, JSON.stringify({ projectId:id, inviteId:inviteId||undefined, memberId:memberId||undefined }));
  return NextResponse.json({ ok:true });
}
