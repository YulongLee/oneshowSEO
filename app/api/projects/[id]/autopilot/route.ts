import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../../../lib/auth";
import {
  autopilotState,
  configureAutopilot,
  startAutopilotRun,
  advanceAutopilotRuns,
} from "../../../../../lib/autopilot";
import { ownedProject } from "../../../../../lib/product";
import {
  can,
  permissions,
  type OrganizationRoleKey,
} from "../../../../../platform/modules/identity/authorization";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!(await ownedProject(user.organization.organizationId, id)))
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json(
    await autopilotState(user.organization.organizationId, id),
    { headers: { "cache-control": "private, no-store" } },
  );
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (
    !can(
      user.organization.roleKey as OrganizationRoleKey,
      permissions.projectsUpdate,
    )
  )
    return NextResponse.json(
      { error: "没有配置自动化的权限" },
      { status: 403 },
    );
  const { id } = await context.params,
    project = await ownedProject(user.organization.organizationId, id);
  if (!project)
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  try {
    const result = await configureAutopilot({
      organizationId: user.organization.organizationId,
      projectId: id,
      accountId: user.id,
      enabled: body?.enabled === true,
      hour: Number(body?.hour),
      minute: Number(body?.minute),
      timezone:
        typeof body?.timezone === "string" ? body.timezone : project.timezone,
      dailyCreditLimit: Number(body?.dailyCreditLimit),
      contentEnabled: body?.contentEnabled === true,
      expectedRevision: Number(body?.revision ?? 0),
    });
    await writeAudit(
      "autopilot_config_updated",
      user.id,
      request,
      JSON.stringify({
        projectId: id,
        enabled: body?.enabled === true,
        dailyCreditLimit: Number(body?.dailyCreditLimit),
        contentEnabled: body?.contentEnabled === true,
      }),
    );
    return NextResponse.json(result);
  } catch (error) {
    const code =
        error instanceof Error ? error.message : "AUTOPILOT_CONFIG_FAILED",
      status = code === "AUTOPILOT_CONFIG_CONFLICT" ? 409 : 400;
    return NextResponse.json(
      {
        error:
          code === "AUTOPILOT_BUDGET_INVALID"
            ? "每日 Credits 上限必须在 23 到 500 之间"
            : code === "AUTOPILOT_CONFIG_CONFLICT"
              ? "配置已更新，请刷新后重试"
              : "自动化配置无效",
        code,
      },
      { status },
    );
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (
    !can(
      user.organization.roleKey as OrganizationRoleKey,
      permissions.projectsUpdate,
    )
  )
    return NextResponse.json(
      { error: "没有运行自动化的权限" },
      { status: 403 },
    );
  const { id } = await context.params;
  if (!(await ownedProject(user.organization.organizationId, id)))
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  try {
    const runId = await startAutopilotRun(user.organization.organizationId, id);
    await advanceAutopilotRuns();
    await writeAudit(
      "autopilot_run_started",
      user.id,
      request,
      JSON.stringify({ projectId: id, runId }),
    );
    return NextResponse.json({ runId, state: "running" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自动任务启动失败" },
      { status: 409 },
    );
  }
}
