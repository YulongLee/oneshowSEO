import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../lib/auth";
import { connectionProviders, ensureProductSchema, normalizeProjectUrl, projectLimit } from "../../../lib/product";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  await ensureProductSchema();
  const projects = getDatabase().prepare(`SELECT id,name,site_url AS siteUrl,host,market,language,business_goal AS businessGoal,
    approval_mode AS approvalMode,schedule_enabled AS scheduleEnabled,created_at AS createdAt,updated_at AS updatedAt
    FROM projects WHERE user_id=? ORDER BY updated_at DESC`).bind(user.id).all().results;
  return NextResponse.json({ projects, limit: projectLimit(user) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim().slice(0, 80);
  const rawUrl = String(body?.siteUrl || "").trim();
  if (!name || !rawUrl) return NextResponse.json({ error: "请填写项目名称和网站地址" }, { status: 400 });
  let normalized: { siteUrl: string; host: string };
  try { normalized = normalizeProjectUrl(rawUrl); } catch { return NextResponse.json({ error: "网站地址格式不正确" }, { status: 400 }); }
  await ensureProductSchema();
  const db = getDatabase();
  const count = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE user_id=?").bind(user.id).first<{count:number}>()?.count || 0;
  if (count >= projectLimit(user)) return NextResponse.json({ error: `当前套餐最多创建 ${projectLimit(user)} 个项目` }, { status: 403 });
  const duplicate = db.prepare("SELECT id FROM projects WHERE user_id=? AND host=?").bind(user.id, normalized.host).first();
  if (duplicate) return NextResponse.json({ error: "该网站已在你的项目中" }, { status: 409 });
  const id = crypto.randomUUID(); const now = Math.floor(Date.now()/1000);
  const market = String(body?.market || "CN").slice(0, 12);
  const language = String(body?.language || "zh-CN").slice(0, 16);
  const goal = String(body?.businessGoal || "organic_growth").slice(0, 50);
  const approval = body?.approvalMode === "low_risk_auto" ? "low_risk_auto" : "required";
  const statements = [db.prepare(`INSERT INTO projects (id,user_id,name,site_url,host,market,language,timezone,business_goal,approval_mode,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'Asia/Shanghai',?,?,?,?)`).bind(id,user.id,name,normalized.siteUrl,normalized.host,market,language,goal,approval,now,now)];
  for (const provider of connectionProviders) statements.push(db.prepare("INSERT INTO project_connections (project_id,provider,status,updated_at) VALUES (?,?,?,?)").bind(id,provider,provider === "public_crawl" ? "connected" : "disconnected",now));
  db.batch(statements);
  await writeAudit("project_created", user.id, request, JSON.stringify({ projectId:id, host:normalized.host }));
  return NextResponse.json({ project: { id, name, ...normalized, market, language, businessGoal:goal, approvalMode:approval } }, { status: 201 });
}
