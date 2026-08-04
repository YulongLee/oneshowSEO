import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, writeAudit } from "../../../../../lib/auth";
import { ensureProductSchema, ownedProject } from "../../../../../lib/product";

type ResearchOpportunity = {
  id: string; title: string; keyword: string; intent: string; source: string; url: string | null;
  priority: number; searchVolume: number | null; keywordDifficulty: number | null; potentialTraffic: number | null; createdAt: number;
};

function payload(projectId: string) {
  const db = getDatabase();
  const latestRun = db.prepare(`SELECT id,status,opportunities_found AS opportunitiesFound,content_ideas AS contentIdeas,
    started_at AS startedAt,completed_at AS completedAt,error FROM research_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1`)
    .bind(projectId).first<Record<string, unknown>>();
  const opportunities = latestRun ? db.prepare(`SELECT id,title,keyword,intent,source,url,priority,search_volume AS searchVolume,
    keyword_difficulty AS keywordDifficulty,potential_traffic AS potentialTraffic,created_at AS createdAt
    FROM research_opportunities WHERE run_id=? ORDER BY priority DESC,created_at DESC LIMIT 100`).bind(latestRun.id).all().results as ResearchOpportunity[] : [];
  const connections = db.prepare(`SELECT provider,status FROM project_connections WHERE project_id=?`).bind(projectId).all().results as Array<{provider:string;status:string}>;
  const connected = Object.fromEntries(connections.map(item => [item.provider, item.status === "connected"]));
  return {
    latestRun,
    opportunities,
    capabilities: {
      publicCrawl: connected.public_crawl === true,
      keywordMetrics: connected.rank_provider === true,
      searchPerformance: connected.google_search_console === true,
      analytics: connected.google_analytics_4 === true,
      competitorData: false,
      trendData: false,
      questionMining: false,
    }
  };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  await ensureProductSchema();
  const { id } = await context.params;
  if (!await ownedProject(user.id, id)) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json(payload(id));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  await ensureProductSchema();
  const { id } = await context.params;
  const project = await ownedProject(user.id, id);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const db = getDatabase(); const runId = crypto.randomUUID(); const now = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO research_runs (id,project_id,status,started_at) VALUES (?,?,'running',?)").bind(runId,id,now).run();
  try {
    const tasks = db.prepare(`SELECT t.id,t.title,t.description,t.priority,f.url,f.category
      FROM seo_tasks t LEFT JOIN findings f ON f.id=t.finding_id WHERE t.project_id=? AND t.status IN ('proposed','approved')
      ORDER BY t.priority DESC,t.created_at DESC LIMIT 50`).bind(id).all().results as Array<{id:string;title:string;description:string;priority:number;url:string|null;category:string|null}>;
    const statements = tasks.map(task => {
      const intent = task.category === "content" || task.category === "on_page" ? "informational" : "technical";
      return db.prepare(`INSERT INTO research_opportunities (id,run_id,project_id,title,keyword,intent,source,url,priority,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,id,task.title,task.title,intent,"site_audit",task.url,task.priority,now);
    });
    const contentIdeas = tasks.filter(task => task.category === "content" || task.category === "on_page").length;
    statements.push(db.prepare("UPDATE research_runs SET status='completed',opportunities_found=?,content_ideas=?,completed_at=? WHERE id=?").bind(tasks.length,contentIdeas,now,runId));
    await db.batch(statements);
    await writeAudit("research_run_completed", user.id, request, JSON.stringify({ projectId:id, runId, opportunities:tasks.length }));
    return NextResponse.json(payload(id));
  } catch (error) {
    db.prepare("UPDATE research_runs SET status='failed',error=?,completed_at=? WHERE id=?").bind(error instanceof Error ? error.message : "RESEARCH_FAILED",now,runId).run();
    return NextResponse.json({ error: "研究任务执行失败" }, { status: 500 });
  }
}
