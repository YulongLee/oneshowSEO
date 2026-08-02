import { NextResponse } from "next/server";
import { ensureAuthSchema, getCurrentUser, getDatabase, writeAudit } from "../../../../lib/auth";

async function adminOrResponse() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function GET() {
  const admin = await adminOrResponse();
  if (!admin) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const database = getDatabase();
  await ensureAuthSchema(database);
  const result = await database.prepare(`
    SELECT id, email, name, role, status, plan, trial_ends_at AS trialEndsAt,
           last_login_at AS lastLoginAt, created_at AS createdAt
    FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  return NextResponse.json({ users: result.results });
}

export async function PATCH(request: Request) {
  const admin = await adminOrResponse();
  if (!admin) return NextResponse.json({ error: "无权访问" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const role = body?.role;
  const status = body?.status;
  const plan = body?.plan;
  if (!id) return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
  if (id === admin.id && status === "suspended") return NextResponse.json({ error: "不能暂停当前管理员账号" }, { status: 400 });
  if (role !== undefined && !["user", "admin"].includes(String(role))) return NextResponse.json({ error: "角色无效" }, { status: 400 });
  if (status !== undefined && !["active", "suspended"].includes(String(status))) return NextResponse.json({ error: "状态无效" }, { status: 400 });
  if (plan !== undefined && !["trial", "starter", "pro", "business"].includes(String(plan))) return NextResponse.json({ error: "套餐无效" }, { status: 400 });
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of [["role", role], ["status", status], ["plan", plan]] as const) {
    if (value !== undefined) { fields.push(`${column} = ?`); values.push(value); }
  }
  if (!fields.length) return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  fields.push("updated_at = ?"); values.push(Math.floor(Date.now() / 1000), id);
  const database = getDatabase();
  await ensureAuthSchema(database);
  const result = await database.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  if (!result.meta.changes) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (status === "suspended") await database.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await writeAudit("admin_user_update", admin.id, request, JSON.stringify({ id, role, status, plan }));
  return NextResponse.json({ ok: true });
}
