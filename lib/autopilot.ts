import { getDatabase } from "./auth";
import { ensureBillingSchema, commerceService } from "./billing";
import {
  atomicTaskCreationService,
  ensureExecutionSchema,
  executionRepository,
} from "./execution";
import { ensureProductSchema } from "./product";
import { nextAgentRun } from "../platform/modules/agents/schedules";
import {
  permissions,
  type OrganizationRoleKey,
  type Permission,
} from "../platform/modules/identity/authorization";
import type { CommercialSubject } from "../platform/modules/commerce";

export type AutopilotStage =
  "research" | "audit" | "content" | "geo" | "analytics";
type ProjectContext = {
  projectId: string;
  organizationId: string;
  accountId: string;
  role: OrganizationRoleKey;
  planKey: CommercialSubject["planKey"];
  trialEndsAt: number | null;
  accountCreatedAt: number;
  organizationStatus: CommercialSubject["organizationStatus"];
  name: string;
  siteUrl: string;
  host: string;
  market: string;
  language: string;
  timezone: string;
  businessGoal: string;
};
const costs: Record<AutopilotStage, number> = {
  research: 5,
  audit: 10,
  content: 20,
  geo: 5,
  analytics: 3,
};

export async function ensureAutopilotSchema() {
  await ensureProductSchema();
  await ensureExecutionSchema();
  getDatabase().exec(`
 CREATE TABLE IF NOT EXISTS autopilot_configs(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,organization_id TEXT NOT NULL REFERENCES identity_organizations(id) ON DELETE CASCADE,enabled INTEGER NOT NULL DEFAULT 0,cron TEXT NOT NULL DEFAULT '0 3 * * *',timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',daily_credit_limit INTEGER NOT NULL DEFAULT 43 CHECK(daily_credit_limit BETWEEN 23 AND 500),content_enabled INTEGER NOT NULL DEFAULT 1,paused_at INTEGER,next_run_at INTEGER,revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS autopilot_configs_due_idx ON autopilot_configs(enabled,paused_at,next_run_at);
 CREATE TABLE IF NOT EXISTS autopilot_runs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,scheduled_for INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('running','completed','partial','failed','paused')),credit_limit INTEGER NOT NULL,credits_planned INTEGER NOT NULL DEFAULT 0,credits_used INTEGER NOT NULL DEFAULT 0,strategy_summary TEXT,started_at INTEGER NOT NULL,completed_at INTEGER,error_code TEXT,UNIQUE(project_id,scheduled_for));
 CREATE INDEX IF NOT EXISTS autopilot_runs_scope_idx ON autopilot_runs(organization_id,project_id,started_at DESC);
 CREATE TABLE IF NOT EXISTS autopilot_steps(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES autopilot_runs(id) ON DELETE CASCADE,stage TEXT NOT NULL CHECK(stage IN('research','audit','content','geo','analytics')),position INTEGER NOT NULL,task_id TEXT,credit_cost INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','queued','completed','failed','skipped')),reason TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(run_id,stage));
 CREATE INDEX IF NOT EXISTS autopilot_steps_run_idx ON autopilot_steps(run_id,position);
 `);
}

function context(
  projectId: string,
  organizationId: string,
): ProjectContext | null {
  return (
    getDatabase()
      .prepare(
        `SELECT p.id projectId,p.organization_id organizationId,p.user_id accountId,p.name,p.site_url siteUrl,p.host,p.market,p.language,p.timezone,p.business_goal businessGoal,u.plan planKey,u.trial_ends_at trialEndsAt,u.created_at accountCreatedAt,o.status organizationStatus,r.role_key role FROM projects p JOIN users u ON u.id=p.user_id JOIN identity_organizations o ON o.id=p.organization_id JOIN identity_memberships m ON m.organization_id=o.id AND m.user_id=u.id AND m.status='active' JOIN identity_roles r ON r.id=m.role_id WHERE p.id=? AND p.organization_id=? AND p.status='active' LIMIT 1`,
      )
      .bind(projectId, organizationId)
      .first<ProjectContext>() ?? null
  );
}
const subject = (row: ProjectContext): CommercialSubject => ({
  accountId: row.accountId,
  organizationId: row.organizationId,
  organizationStatus: row.organizationStatus,
  planKey: row.planKey,
  trialEndsAt: row.trialEndsAt,
  accountCreatedAt: row.accountCreatedAt,
});

export async function autopilotState(
  organizationId: string,
  projectId: string,
) {
  await ensureAutopilotSchema();
  const db = getDatabase(),
    config = db
      .prepare(
        "SELECT project_id projectId,enabled,cron,timezone,daily_credit_limit dailyCreditLimit,content_enabled contentEnabled,paused_at pausedAt,next_run_at nextRunAt,revision,updated_at updatedAt FROM autopilot_configs WHERE organization_id=? AND project_id=?",
      )
      .bind(organizationId, projectId)
      .first<Record<string, unknown>>(),
    run = db
      .prepare(
        "SELECT * FROM autopilot_runs WHERE organization_id=? AND project_id=? ORDER BY started_at DESC LIMIT 1",
      )
      .bind(organizationId, projectId)
      .first<Record<string, unknown>>(),
    steps = run
      ? db
          .prepare(
            "SELECT stage,position,task_id taskId,credit_cost creditCost,status,reason,updated_at updatedAt FROM autopilot_steps WHERE run_id=? ORDER BY position",
          )
          .bind(String(run.id))
          .all().results
      : [];
  return {
    config: config
      ? {
          ...config,
          enabled: Boolean(config.enabled),
          contentEnabled: Boolean(config.contentEnabled),
        }
      : null,
    latestRun: run ? { ...run, steps } : null,
    minimumDailyCredits: 23,
    fullDailyCredits: 43,
  };
}

export async function configureAutopilot(input: {
  organizationId: string;
  projectId: string;
  accountId: string;
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  dailyCreditLimit: number;
  contentEnabled: boolean;
  expectedRevision: number;
}) {
  await ensureAutopilotSchema();
  if (
    !Number.isInteger(input.hour) ||
    input.hour < 0 ||
    input.hour > 23 ||
    !Number.isInteger(input.minute) ||
    input.minute < 0 ||
    input.minute > 59
  )
    throw new Error("AUTOPILOT_TIME_INVALID");
  if (
    !Number.isInteger(input.dailyCreditLimit) ||
    input.dailyCreditLimit < 23 ||
    input.dailyCreditLimit > 500
  )
    throw new Error("AUTOPILOT_BUDGET_INVALID");
  const row = context(input.projectId, input.organizationId);
  if (!row) throw new Error("AUTOPILOT_PROJECT_NOT_ACTIVE");
  const cron = `${input.minute} ${input.hour} * * *`,
    now = Math.floor(Date.now() / 1000),
    db = getDatabase(),
    current = db
      .prepare(
        "SELECT revision,created_at createdAt FROM autopilot_configs WHERE organization_id=? AND project_id=?",
      )
      .bind(input.organizationId, input.projectId)
      .first<{ revision: number; createdAt: number }>();
  if ((current?.revision ?? 0) !== input.expectedRevision)
    throw new Error("AUTOPILOT_CONFIG_CONFLICT");
  const next = input.enabled
    ? nextAgentRun(cron, input.timezone, null, now)
    : null;
  if (current)
    db.prepare(
      "UPDATE autopilot_configs SET enabled=?,cron=?,timezone=?,daily_credit_limit=?,content_enabled=?,paused_at=NULL,next_run_at=?,revision=revision+1,updated_by=?,updated_at=? WHERE organization_id=? AND project_id=? AND revision=?",
    )
      .bind(
        input.enabled ? 1 : 0,
        cron,
        input.timezone,
        input.dailyCreditLimit,
        input.contentEnabled ? 1 : 0,
        next,
        input.accountId,
        now,
        input.organizationId,
        input.projectId,
        input.expectedRevision,
      )
      .run();
  else
    db.prepare(
      "INSERT INTO autopilot_configs(project_id,organization_id,enabled,cron,timezone,daily_credit_limit,content_enabled,next_run_at,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        input.projectId,
        input.organizationId,
        input.enabled ? 1 : 0,
        cron,
        input.timezone,
        input.dailyCreditLimit,
        input.contentEnabled ? 1 : 0,
        next,
        input.accountId,
        now,
        now,
      )
      .run();
  return autopilotState(input.organizationId, input.projectId);
}

export async function startAutopilotRun(
  organizationId: string,
  projectId: string,
  scheduledFor = Math.floor(Date.now() / 1000),
) {
  await ensureAutopilotSchema();
  await ensureBillingSchema();
  const db = getDatabase(),
    row = context(projectId, organizationId);
  if (!row) throw new Error("AUTOPILOT_PROJECT_NOT_ACTIVE");
  commerceService().authorizeAccess(subject(row));
  const config = db
      .prepare(
        "SELECT daily_credit_limit dailyCreditLimit,content_enabled contentEnabled FROM autopilot_configs WHERE organization_id=? AND project_id=?",
      )
      .bind(organizationId, projectId)
      .first<{ dailyCreditLimit: number; contentEnabled: number }>() ?? {
      dailyCreditLimit: 43,
      contentEnabled: 1,
    },
    day = new Intl.DateTimeFormat("en-CA", {
      timeZone: row.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(scheduledFor * 1000)),
    existing = db
      .prepare(
        "SELECT id FROM autopilot_runs WHERE project_id=? AND strategy_summary LIKE ?",
      )
      .bind(projectId, `%\"day\":\"${day}\"%`)
      .first<{ id: string }>();
  if (existing) return existing.id;
  const stages: AutopilotStage[] =
      config.contentEnabled && config.dailyCreditLimit >= 43
        ? ["research", "audit", "content", "geo", "analytics"]
        : ["research", "audit", "geo", "analytics"],
    planned = stages.reduce((sum, item) => sum + costs[item], 0),
    id = crypto.randomUUID(),
    now = Math.floor(Date.now() / 1000);
  db.transaction(() => {
    db.prepare(
      "INSERT INTO autopilot_runs(id,organization_id,project_id,scheduled_for,status,credit_limit,credits_planned,strategy_summary,started_at) VALUES (?,?,?,?, 'running',?,?,?,?)",
    )
      .bind(
        id,
        organizationId,
        projectId,
        scheduledFor,
        config.dailyCreditLimit,
        planned,
        JSON.stringify({
          day,
          goal: row.businessGoal,
          mode: "evidence_first",
          publish: "approval_required",
        }),
        now,
      )
      .run();
    for (const [position, stage] of stages.entries())
      db.prepare(
        "INSERT INTO autopilot_steps(id,run_id,stage,position,credit_cost,status,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?)",
      )
        .bind(crypto.randomUUID(), id, stage, position, costs[stage], now, now)
        .run();
  });
  return id;
}

function topOpportunity(projectId: string) {
  return getDatabase()
    .prepare(
      "SELECT title,keyword,intent,url FROM research_opportunities WHERE project_id=? ORDER BY priority DESC,confidence DESC,created_at DESC LIMIT 1",
    )
    .bind(projectId)
    .first<{
      title: string;
      keyword: string;
      intent: string;
      url: string | null;
    }>();
}
async function queueStage(
  run: {
    id: string;
    organizationId: string;
    projectId: string;
    scheduledFor: number;
  },
  stage: AutopilotStage,
  position: number,
) {
  const row = context(run.projectId, run.organizationId);
  if (!row) throw new Error("AUTOPILOT_PROJECT_NOT_ACTIVE");
  const commerce = commerceService(),
    effective = commerce.resolve(subject(row)),
    usageTotals = commerce.usageTotals(subject(row)),
    usage = usageTotals.find((item) => item.metric === "pages_crawled"),
    currentPages = Number(usage?.final ?? 0) + Number(usage?.pending ?? 0),
    contentUsage = usageTotals.find(
      (item) => item.metric === "content_generated",
    ),
    currentContent =
      Number(contentUsage?.final ?? 0) + Number(contentUsage?.pending ?? 0),
    pageLimit = Math.max(
      1,
      Math.min(
        effective.limits.pagesPerAudit,
        effective.limits.pagesPerMonth - currentPages,
        stage === "geo" ? 30 : 50,
      ),
    ),
    opportunity = stage === "content" ? topOpportunity(run.projectId) : null;
  if (stage === "content" && !opportunity) return null;
  const definitions: Record<
    AutopilotStage,
    {
      permission: Permission;
      capability: string;
      taskType: string;
      jobType: string;
      priority: number;
      timeout: number;
      input: Record<string, unknown>;
      entitlements: Array<{
        key: "pagesPerAudit" | "pagesPerMonth" | "contentItems";
        quantity: number;
        currentUsage: number;
      }>;
    }
  > = {
    research: {
      permission: permissions.researchRun,
      capability: "research.discover",
      taskType: "research_agent",
      jobType: "research.run",
      priority: 70,
      timeout: 900,
      input: {
        projectId: row.projectId,
        siteUrl: row.siteUrl,
        market: row.market,
        language: row.language,
        seed: row.businessGoal,
        maximumPages: pageLimit,
        title: `${row.name} 每日机会研究`,
        description: "Autopilot 基于新鲜证据发现增长机会",
      },
      entitlements: [],
    },
    audit: {
      permission: permissions.auditsRun,
      capability: "audit.run",
      taskType: "seo_audit",
      jobType: "seo.audit",
      priority: 80,
      timeout: 900,
      input: {
        projectId: row.projectId,
        siteUrl: row.siteUrl,
        pageLimit,
        title: `${row.name} 每日网站诊断`,
        description: "Autopilot 验证技术 SEO 变化与开放问题",
      },
      entitlements: [
        { key: "pagesPerAudit", quantity: 1, currentUsage: 0 },
        { key: "pagesPerMonth", quantity: 1, currentUsage: currentPages },
      ],
    },
    content: {
      permission: permissions.contentCreate,
      capability: "content.generate",
      taskType: "content_agent",
      jobType: "content.generate",
      priority: 60,
      timeout: 900,
      input: {
        projectId: row.projectId,
        title: opportunity?.title || "每日内容候选",
        keyword: opportunity?.keyword || row.businessGoal,
        contentType: "blog_post",
        audience: "目标客户",
        intent: opportunity?.intent || "informational",
        tone: "专业、可信、清晰",
        goal: row.businessGoal,
        sourceRef: opportunity?.url || row.siteUrl,
        brief:
          "由每日 Autopilot 根据最高优先级研究机会生成；只生成待审核草稿，不自动发布。",
        description: "每日 Autopilot 内容候选，必须人工审核后才能发布",
      },
      entitlements: [
        { key: "contentItems", quantity: 1, currentUsage: currentContent },
      ],
    },
    geo: {
      permission: permissions.auditsRun,
      capability: "geo.audit",
      taskType: "geo_agent",
      jobType: "geo.audit",
      priority: 65,
      timeout: 900,
      input: {
        projectId: row.projectId,
        siteUrl: row.siteUrl,
        maximumPages: pageLimit,
        title: `${row.name} 每日 GEO 扫描`,
        description: "Autopilot 检查机器可读性、答案结构与 AI 爬虫策略",
      },
      entitlements: [],
    },
    analytics: {
      permission: permissions.auditsRun,
      capability: "analytics.snapshot",
      taskType: "analytics_agent",
      jobType: "analytics.snapshot",
      priority: 55,
      timeout: 300,
      input: {
        projectId: row.projectId,
        lookbackDays: 30,
        title: `${row.name} 每日策略复盘`,
        description: "汇总本轮 Agent 证据、变化和建议，形成下一轮优化优先级",
      },
      entitlements: [],
    },
  };
  const definition = definitions[stage],
    created = (await atomicTaskCreationService()).create({
      activeOrganizationId: row.organizationId,
      organizationId: row.organizationId,
      projectId: row.projectId,
      requestedByAccountId: row.accountId,
      role: row.role,
      permission: definition.permission,
      subject: subject(row),
      triggerType: "agent",
      taskType: definition.taskType,
      capability: definition.capability,
      input: {
        ...definition.input,
        autopilotRunId: run.id,
        autopilotStage: stage,
      },
      locale: row.language.startsWith("en") ? "en" : "zh-CN",
      idempotencyKey: `autopilot:${run.id}:${position}:${stage}`,
      correlationId: `autopilot:${run.id}`,
      entitlements: definition.entitlements,
      creditCost: costs[stage],
      queue: "agents",
      jobType: definition.jobType,
      priority: definition.priority,
      maxAttempts: 3,
      timeoutSeconds: definition.timeout,
    });
  return created.task.id;
}

export async function advanceAutopilotRuns(limit = 20) {
  await ensureAutopilotSchema();
  await ensureBillingSchema();
  const db = getDatabase(),
    now = Math.floor(Date.now() / 1000);
  for (const config of db
    .prepare(
      "SELECT project_id projectId,organization_id organizationId,next_run_at nextRunAt,cron,timezone FROM autopilot_configs WHERE enabled=1 AND paused_at IS NULL AND next_run_at IS NOT NULL AND next_run_at<=? ORDER BY next_run_at LIMIT ?",
    )
    .bind(now, limit)
    .all<{
      projectId: string;
      organizationId: string;
      nextRunAt: number;
      cron: string;
      timezone: string;
    }>().results) {
    await startAutopilotRun(
      config.organizationId,
      config.projectId,
      config.nextRunAt,
    );
    db.prepare(
      "UPDATE autopilot_configs SET next_run_at=?,revision=revision+1,updated_at=? WHERE project_id=? AND next_run_at=?",
    )
      .bind(
        nextAgentRun(config.cron, config.timezone, null, config.nextRunAt),
        now,
        config.projectId,
        config.nextRunAt,
      )
      .run();
  }
  const runs = db
    .prepare(
      "SELECT id,organization_id organizationId,project_id projectId,scheduled_for scheduledFor FROM autopilot_runs WHERE status='running' ORDER BY started_at LIMIT ?",
    )
    .bind(limit)
    .all<{
      id: string;
      organizationId: string;
      projectId: string;
      scheduledFor: number;
    }>().results;
  for (const run of runs) {
    const steps = db
      .prepare(
        "SELECT stage,position,task_id taskId,credit_cost creditCost,status FROM autopilot_steps WHERE run_id=? ORDER BY position",
      )
      .bind(run.id)
      .all<{
        stage: AutopilotStage;
        position: number;
        taskId: string | null;
        creditCost: number;
        status: string;
      }>().results;
    let blocked = false;
    for (const step of steps) {
      if (step.status === "completed" || step.status === "skipped") continue;
      if (step.status === "queued" && step.taskId) {
        const task = executionRepository().task(
          run.organizationId,
          step.taskId,
        );
        if (task?.state === "completed") {
          db.prepare(
            "UPDATE autopilot_steps SET status='completed',updated_at=? WHERE run_id=? AND stage=?",
          )
            .bind(now, run.id, step.stage)
            .run();
          db.prepare(
            "UPDATE autopilot_runs SET credits_used=credits_used+? WHERE id=?",
          )
            .bind(step.creditCost, run.id)
            .run();
          continue;
        }
        if (
          task &&
          ["failed", "cancelled", "quarantined"].includes(task.state)
        ) {
          db.prepare(
            "UPDATE autopilot_steps SET status='failed',reason=?,updated_at=? WHERE run_id=? AND stage=?",
          )
            .bind(`TASK_${task.state.toUpperCase()}`, now, run.id, step.stage)
            .run();
          db.prepare(
            "UPDATE autopilot_runs SET status='partial',completed_at=?,error_code=? WHERE id=?",
          )
            .bind(
              now,
              `AUTOPILOT_${step.stage.toUpperCase()}_${task.state.toUpperCase()}`,
              run.id,
            )
            .run();
          blocked = true;
          break;
        }
        blocked = true;
        break;
      }
      if (step.status === "pending") {
        try {
          const taskId = await queueStage(run, step.stage, step.position);
          if (!taskId) {
            db.prepare(
              "UPDATE autopilot_steps SET status='skipped',reason='NO_VERIFIED_OPPORTUNITY',updated_at=? WHERE run_id=? AND stage=?",
            )
              .bind(now, run.id, step.stage)
              .run();
            continue;
          }
          db.prepare(
            "UPDATE autopilot_steps SET status='queued',task_id=?,updated_at=? WHERE run_id=? AND stage=?",
          )
            .bind(taskId, now, run.id, step.stage)
            .run();
        } catch (error) {
          db.prepare(
            "UPDATE autopilot_runs SET status='partial',completed_at=?,error_code=? WHERE id=?",
          )
            .bind(
              now,
              error instanceof Error
                ? error.message.slice(0, 128)
                : "AUTOPILOT_QUEUE_FAILED",
              run.id,
            )
            .run();
        }
        blocked = true;
        break;
      }
    }
    if (
      !blocked &&
      db
        .prepare(
          "SELECT COUNT(*) count FROM autopilot_steps WHERE run_id=? AND status NOT IN('completed','skipped')",
        )
        .bind(run.id)
        .first<{ count: number }>()?.count === 0
    ) {
      const summary = {
        conclusion: "本轮证据采集、诊断、内容候选、GEO 检查与策略复盘已完成",
        nextAction:
          "请在任务中心和审批中心查看按证据排序的建议；发布操作仍需人工批准",
        publishPolicy: "approval_required",
        completedAt: now,
      };
      db.prepare(
        "UPDATE autopilot_runs SET status='completed',strategy_summary=?,completed_at=? WHERE id=?",
      )
        .bind(JSON.stringify(summary), now, run.id)
        .run();
    }
  }
  return runs.length;
}
