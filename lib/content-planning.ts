import { getDatabase } from "./auth";

export const CONTENT_OPPORTUNITY_STATES = ["NEW", "PLANNED", "IGNORED", "CONVERTED"] as const;
export const CONTENT_BRIEF_STATES = ["DRAFT", "READY", "GENERATING", "REVIEW", "APPROVED"] as const;
export const CONTENT_PLAN_STATES = ["UNSCHEDULED", "SCHEDULED", "IN_PROGRESS", "PUBLISHED", "FAILED"] as const;

export type ContentOpportunityStatus = (typeof CONTENT_OPPORTUNITY_STATES)[number];
export type ContentBriefStatus = (typeof CONTENT_BRIEF_STATES)[number];
export type ContentPlanStatus = (typeof CONTENT_PLAN_STATES)[number];

export type ContentOpportunity = {
  id: string;
  projectId: string;
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  source: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  opportunityScore: number;
  searchIntent: string;
  businessRelevance: number | null;
  trendScore: number | null;
  geoScore: number | null;
  contentGapScore: number | null;
  recommendedContentType: string;
  recommendedPlatforms: string[];
  status: ContentOpportunityStatus;
  sourceUrl: string | null;
  confidence: number;
  createdAt: number;
  updatedAt: number;
};

export type ContentBrief = {
  id: string;
  projectId: string;
  opportunityId: string | null;
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  audience: string;
  searchIntent: string;
  contentGoal: string;
  contentType: string;
  suggestedWordCount: number;
  outline: string[];
  targetPlatforms: string[];
  status: ContentBriefStatus;
  createdAt: number;
  updatedAt: number;
};

export type ContentPlan = {
  id: string;
  projectId: string;
  briefId: string;
  scheduledAt: number | null;
  priority: number;
  status: ContentPlanStatus;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
};

export function ensureContentPlanningSchema() {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS content_opportunity_states (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      opportunity_id TEXT NOT NULL REFERENCES research_opportunities(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','PLANNED','IGNORED','CONVERTED')),
      updated_by_account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id,opportunity_id)
    );
    CREATE INDEX IF NOT EXISTS content_opportunity_states_scope_idx ON content_opportunity_states(organization_id,project_id,status,updated_at DESC);
    CREATE TABLE IF NOT EXISTS content_briefs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES research_opportunities(id) ON DELETE SET NULL,
      topic TEXT NOT NULL,
      primary_keyword TEXT NOT NULL,
      secondary_keywords TEXT NOT NULL DEFAULT '[]',
      audience TEXT NOT NULL,
      search_intent TEXT NOT NULL,
      content_goal TEXT NOT NULL,
      content_type TEXT NOT NULL,
      suggested_word_count INTEGER NOT NULL CHECK(suggested_word_count BETWEEN 100 AND 20000),
      outline TEXT NOT NULL DEFAULT '[]',
      target_platforms TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','GENERATING','REVIEW','APPROVED')),
      created_by_account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_briefs_scope_idx ON content_briefs(organization_id,project_id,status,updated_at DESC);
    CREATE TABLE IF NOT EXISTS content_plans (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      brief_id TEXT NOT NULL REFERENCES content_briefs(id) ON DELETE CASCADE,
      scheduled_at INTEGER,
      priority INTEGER NOT NULL DEFAULT 50 CHECK(priority BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'UNSCHEDULED' CHECK(status IN ('UNSCHEDULED','SCHEDULED','IN_PROGRESS','PUBLISHED','FAILED')),
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id,brief_id)
    );
    CREATE INDEX IF NOT EXISTS content_plans_calendar_idx ON content_plans(organization_id,project_id,scheduled_at,status);
  `);
}

const parseList = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export function readContentPlanning(organizationId: string, projectId: string) {
  ensureContentPlanningSchema();
  const db = getDatabase();
  const opportunityRows = db.prepare(`
    SELECT ro.id,ro.project_id AS projectId,ro.title AS topic,ro.keyword AS primaryKeyword,
      ro.source,ro.url AS sourceUrl,ro.priority,ro.search_volume AS searchVolume,
      ro.keyword_difficulty AS keywordDifficulty,ro.potential_traffic AS potentialTraffic,
      ro.intent AS searchIntent,ro.confidence,ro.created_at AS createdAt,
      COALESCE(cos.status,'NEW') AS status,COALESCE(cos.updated_at,ro.created_at) AS updatedAt
    FROM research_opportunities ro
    LEFT JOIN content_opportunity_states cos ON cos.project_id=ro.project_id AND cos.opportunity_id=ro.id
    WHERE ro.project_id=? AND COALESCE(cos.status,'NEW')!='IGNORED'
    ORDER BY ro.priority DESC,ro.created_at DESC LIMIT 200
  `).bind(projectId).all().results as Array<Record<string, unknown>>;
  const opportunities: ContentOpportunity[] = opportunityRows.map((row) => ({
    id: String(row.id), projectId: String(row.projectId), topic: String(row.topic),
    primaryKeyword: String(row.primaryKeyword), secondaryKeywords: [], source: String(row.source || "站内研究"),
    searchVolume: row.searchVolume === null ? null : Number(row.searchVolume),
    keywordDifficulty: row.keywordDifficulty === null ? null : Number(row.keywordDifficulty),
    opportunityScore: Math.max(0, Math.min(100, Number(row.priority || 0))), searchIntent: String(row.searchIntent || "informational"),
    businessRelevance: null, trendScore: null, geoScore: null, contentGapScore: null,
    recommendedContentType: "guide", recommendedPlatforms: ["官网 / SEO"],
    status: String(row.status) as ContentOpportunityStatus, sourceUrl: row.sourceUrl ? String(row.sourceUrl) : null,
    confidence: Number(row.confidence || 0), createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt),
  })).filter((item) =>
    item.searchIntent !== "technical" && item.source !== "site_audit" &&
    !/HSTS|robots\.txt|sitemap|security policy|安全响应头|标题长度|meta description|内部链接/i.test(`${item.topic} ${item.primaryKeyword}`),
  );
  const briefRows = db.prepare(`SELECT id,project_id AS projectId,opportunity_id AS opportunityId,topic,primary_keyword AS primaryKeyword,secondary_keywords AS secondaryKeywords,audience,search_intent AS searchIntent,content_goal AS contentGoal,content_type AS contentType,suggested_word_count AS suggestedWordCount,outline,target_platforms AS targetPlatforms,status,created_at AS createdAt,updated_at AS updatedAt FROM content_briefs WHERE organization_id=? AND project_id=? ORDER BY updated_at DESC LIMIT 200`).bind(organizationId,projectId).all().results as Array<Record<string, unknown>>;
  const briefs: ContentBrief[] = briefRows.map((row) => ({...row, id:String(row.id),projectId:String(row.projectId),opportunityId:row.opportunityId?String(row.opportunityId):null,topic:String(row.topic),primaryKeyword:String(row.primaryKeyword),secondaryKeywords:parseList(row.secondaryKeywords),audience:String(row.audience),searchIntent:String(row.searchIntent),contentGoal:String(row.contentGoal),contentType:String(row.contentType),suggestedWordCount:Number(row.suggestedWordCount),outline:parseList(row.outline),targetPlatforms:parseList(row.targetPlatforms),status:String(row.status) as ContentBriefStatus,createdAt:Number(row.createdAt),updatedAt:Number(row.updatedAt)}));
  const planRows = db.prepare(`SELECT id,project_id AS projectId,brief_id AS briefId,scheduled_at AS scheduledAt,priority,status,owner_id AS ownerId,created_at AS createdAt,updated_at AS updatedAt FROM content_plans WHERE organization_id=? AND project_id=? ORDER BY COALESCE(scheduled_at,9223372036854775807),priority DESC`).bind(organizationId,projectId).all().results as Array<Record<string, unknown>>;
  const plans: ContentPlan[] = planRows.map((row) => ({id:String(row.id),projectId:String(row.projectId),briefId:String(row.briefId),scheduledAt:row.scheduledAt===null?null:Number(row.scheduledAt),priority:Number(row.priority),status:String(row.status) as ContentPlanStatus,ownerId:String(row.ownerId),createdAt:Number(row.createdAt),updatedAt:Number(row.updatedAt)}));
  return { opportunities, briefs, plans };
}

export function createContentBrief(input: Omit<ContentBrief,"id"|"status"|"createdAt"|"updatedAt"> & {organizationId:string;accountId:string;priority:number;scheduledAt:number|null}) {
  ensureContentPlanningSchema();
  const db=getDatabase(),now=Math.floor(Date.now()/1000),briefId=crypto.randomUUID(),planId=crypto.randomUUID();
  if(input.opportunityId) {
    const opportunity=db.prepare("SELECT id FROM research_opportunities WHERE id=? AND project_id=?").bind(input.opportunityId,input.projectId).first();
    if(!opportunity) throw new Error("CONTENT_OPPORTUNITY_NOT_FOUND");
  }
  const status:ContentBriefStatus="READY",planStatus:ContentPlanStatus=input.scheduledAt?"SCHEDULED":"UNSCHEDULED";
  db.batch([
    db.prepare(`INSERT INTO content_briefs(id,organization_id,project_id,opportunity_id,topic,primary_keyword,secondary_keywords,audience,search_intent,content_goal,content_type,suggested_word_count,outline,target_platforms,status,created_by_account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(briefId,input.organizationId,input.projectId,input.opportunityId,input.topic,input.primaryKeyword,JSON.stringify(input.secondaryKeywords),input.audience,input.searchIntent,input.contentGoal,input.contentType,input.suggestedWordCount,JSON.stringify(input.outline),JSON.stringify(input.targetPlatforms),status,input.accountId,now,now),
    db.prepare(`INSERT INTO content_plans(id,organization_id,project_id,brief_id,scheduled_at,priority,status,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(planId,input.organizationId,input.projectId,briefId,input.scheduledAt,input.priority,planStatus,input.accountId,now,now),
    ...(input.opportunityId?[db.prepare(`INSERT INTO content_opportunity_states(project_id,opportunity_id,organization_id,status,updated_by_account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id,opportunity_id) DO UPDATE SET status='CONVERTED',updated_by_account_id=excluded.updated_by_account_id,updated_at=excluded.updated_at`).bind(input.projectId,input.opportunityId,input.organizationId,"CONVERTED",input.accountId,now,now)]:[]),
  ]);
  return {briefId,planId,status,planStatus};
}

export function setOpportunityStatus(input:{organizationId:string;projectId:string;opportunityId:string;accountId:string;status:ContentOpportunityStatus}) {
  ensureContentPlanningSchema();
  const db=getDatabase(),exists=db.prepare("SELECT id FROM research_opportunities WHERE id=? AND project_id=?").bind(input.opportunityId,input.projectId).first();
  if(!exists) throw new Error("CONTENT_OPPORTUNITY_NOT_FOUND");
  const now=Math.floor(Date.now()/1000);
  db.prepare(`INSERT INTO content_opportunity_states(project_id,opportunity_id,organization_id,status,updated_by_account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id,opportunity_id) DO UPDATE SET status=excluded.status,updated_by_account_id=excluded.updated_by_account_id,updated_at=excluded.updated_at`).bind(input.projectId,input.opportunityId,input.organizationId,input.status,input.accountId,now,now).run();
}

export function updateContentPlan(input:{organizationId:string;projectId:string;planId:string;scheduledAt:number|null;priority:number;status:ContentPlanStatus}) {
  ensureContentPlanningSchema();
  const db=getDatabase(),plan=db.prepare("SELECT id,status FROM content_plans WHERE id=? AND organization_id=? AND project_id=?").bind(input.planId,input.organizationId,input.projectId).first<{id:string;status:string}>();
  if(!plan) throw new Error("CONTENT_PLAN_NOT_FOUND");
  if(!["UNSCHEDULED","SCHEDULED"].includes(plan.status))throw new Error("CONTENT_PLAN_IN_EXECUTION");
  const status:ContentPlanStatus=input.status==="UNSCHEDULED"&&input.scheduledAt?"SCHEDULED":input.status==="SCHEDULED"&&!input.scheduledAt?"UNSCHEDULED":input.status;
  const now=Math.floor(Date.now()/1000);
  db.prepare("UPDATE content_plans SET scheduled_at=?,priority=?,status=?,updated_at=? WHERE id=? AND organization_id=? AND project_id=?").bind(input.scheduledAt,input.priority,status,now,input.planId,input.organizationId,input.projectId).run();
  return {planId:input.planId,scheduledAt:input.scheduledAt,priority:input.priority,status,updatedAt:now};
}
