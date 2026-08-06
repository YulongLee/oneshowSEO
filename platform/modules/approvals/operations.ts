import type {
  ApprovalAssignment,
  ApprovalDecisionRecord,
  ApprovalRecommendation,
  RecommendationState,
} from "./model";

export type GovernedApprovalAction = "approve" | "reject" | "request_changes" | "defer" | "expire";
export type ApprovalOperationActor = {
  id: string;
  membershipId: string | null;
  kind: "human" | "system";
  organizationId: string;
  active: boolean;
  projectIds: ReadonlySet<string> | "*";
  permissions: ReadonlySet<string>;
};
export type ApprovalAuditRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  actorType: "user" | "system";
  actorId: string;
  action: string;
  targetId: string;
  reason: string;
  policyVersion: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
  occurredAt: number;
};

export interface ApprovalOperationsRepository {
  transaction<T>(operation: () => T): T;
  recommendation(organizationId: string, projectId: string, recommendationId: string): ApprovalRecommendation | null;
  assignment(recommendationId: string): ApprovalAssignment | null;
  assignmentTargetExists(organizationId: string, projectId: string, membershipId: string): boolean;
  updateRecommendationState(input: {
    organizationId: string;
    projectId: string;
    recommendationId: string;
    state: RecommendationState;
    expectedStateRevision: number;
    now: number;
  }): boolean;
  appendDecision(decision: ApprovalDecisionRecord): void;
  putAssignment(assignment: ApprovalAssignment, expectedRevision: number): boolean;
  appendApprovalAudit(record: ApprovalAuditRecord): void;
}

export class ApprovalOperationError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "TENANT_MISMATCH"
      | "PROJECT_FORBIDDEN"
      | "INVALID_REASON"
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "NOT_ASSIGNED"
      | "STATE_CONFLICT"
      | "INVALID_TRANSITION"
      | "NOT_EXPIRED"
      | "ASSIGNEE_NOT_FOUND"
      | "ASSIGNMENT_CONFLICT",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type DecideInput = {
  organizationId: string;
  projectId: string;
  recommendationId: string;
  action: GovernedApprovalAction;
  reason: string;
  expectedStateRevision: number;
  correlationId: string;
  policy: { id: string; version: number } | null;
};

const nextState: Record<GovernedApprovalAction, RecommendationState> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  defer: "deferred",
  expire: "expired",
};
const transitions: Record<GovernedApprovalAction, ReadonlySet<RecommendationState>> = {
  approve: new Set(["pending", "deferred"]),
  reject: new Set(["pending", "deferred", "changes_requested"]),
  request_changes: new Set(["pending", "deferred"]),
  defer: new Set(["pending", "changes_requested"]),
  expire: new Set(["pending", "deferred", "changes_requested"]),
};

function reason(value: unknown) {
  if (typeof value !== "string") throw new ApprovalOperationError("INVALID_REASON", "审批原因不能为空", 400);
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 1000)
    throw new ApprovalOperationError("INVALID_REASON", "审批原因长度应为 2 到 1000 个字符", 400);
  return normalized;
}

function correlationId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value))
    throw new ApprovalOperationError("INVALID_REQUEST", "关联标识无效", 400);
  return value;
}

export class ApprovalOperationsService {
  constructor(
    private readonly repository: ApprovalOperationsRepository,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  decide(actor: ApprovalOperationActor, input: DecideInput) {
    return this.repository.transaction(() => this.decideInTransaction(actor, input));
  }

  decideBulk(actor: ApprovalOperationActor, inputs: DecideInput[]) {
    if (inputs.length < 1 || inputs.length > 50)
      throw new ApprovalOperationError("INVALID_REQUEST", "批量审批数量应为 1 到 50 条", 400);
    const ids = new Set(inputs.map((input) => input.recommendationId));
    if (ids.size !== inputs.length) throw new ApprovalOperationError("INVALID_REQUEST", "批量审批不能包含重复建议", 400);
    return this.repository.transaction(() => inputs.map((input) => this.decideInTransaction(actor, input)));
  }

  reassign(
    actor: ApprovalOperationActor,
    input: {
      organizationId: string;
      projectId: string;
      recommendationId: string;
      membershipId: string;
      reason: string;
      expectedAssignmentRevision: number;
      correlationId: string;
    },
  ) {
    return this.repository.transaction(() => {
      this.authorize(actor, input.organizationId, input.projectId, false);
      const safeReason = reason(input.reason);
      const safeCorrelation = correlationId(input.correlationId);
      const recommendation = this.requiredRecommendation(input.organizationId, input.projectId, input.recommendationId);
      if (!transitions.expire.has(recommendation.state))
        throw new ApprovalOperationError("INVALID_TRANSITION", "当前审批状态不能重新分配", 409);
      if (!this.repository.assignmentTargetExists(input.organizationId, input.projectId, input.membershipId))
        throw new ApprovalOperationError("ASSIGNEE_NOT_FOUND", "新的审批人不存在或无项目权限", 404);
      const current = this.repository.assignment(recommendation.id);
      if ((current?.revision ?? 0) !== input.expectedAssignmentRevision)
        throw new ApprovalOperationError("ASSIGNMENT_CONFLICT", "审批分配已更新，请刷新后重试", 409);
      const now = this.now();
      const assignment: ApprovalAssignment = {
        id: current?.id ?? crypto.randomUUID(),
        recommendationId: recommendation.id,
        membershipId: input.membershipId,
        revision: input.expectedAssignmentRevision + 1,
        assignedBy: actor.id,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      if (!this.repository.putAssignment(assignment, input.expectedAssignmentRevision))
        throw new ApprovalOperationError("ASSIGNMENT_CONFLICT", "审批分配已更新，请刷新后重试", 409);
      this.repository.appendApprovalAudit({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        actorType: "user",
        actorId: actor.id,
        action: "approval.reassigned",
        targetId: recommendation.id,
        reason: safeReason,
        policyVersion: null,
        correlationId: safeCorrelation,
        metadata: { membershipId: input.membershipId, assignmentRevision: assignment.revision },
        occurredAt: now,
      });
      return assignment;
    });
  }

  private decideInTransaction(actor: ApprovalOperationActor, input: DecideInput) {
    this.authorize(actor, input.organizationId, input.projectId, input.action === "expire");
    const safeReason = reason(input.reason);
    const safeCorrelation = correlationId(input.correlationId);
    if (!Number.isInteger(input.expectedStateRevision) || input.expectedStateRevision < 1)
      throw new ApprovalOperationError("INVALID_REQUEST", "审批状态版本无效", 400);
    const recommendation = this.requiredRecommendation(input.organizationId, input.projectId, input.recommendationId);
    if (recommendation.stateRevision !== input.expectedStateRevision)
      throw new ApprovalOperationError("STATE_CONFLICT", "审批状态已更新，请刷新后重试", 409);
    if (!transitions[input.action].has(recommendation.state))
      throw new ApprovalOperationError("INVALID_TRANSITION", "当前审批状态不允许此操作", 409);
    if (input.action === "expire" && recommendation.expiresAt > this.now())
      throw new ApprovalOperationError("NOT_EXPIRED", "审批尚未到期", 409);
    const assignment = this.repository.assignment(recommendation.id);
    if (
      actor.kind === "human" &&
      assignment &&
      assignment.membershipId !== actor.membershipId &&
      !actor.permissions.has("*")
    )
      throw new ApprovalOperationError("NOT_ASSIGNED", "该审批已分配给其他成员", 403);
    const now = this.now();
    if (
      !this.repository.updateRecommendationState({
        organizationId: input.organizationId,
        projectId: input.projectId,
        recommendationId: recommendation.id,
        state: nextState[input.action],
        expectedStateRevision: input.expectedStateRevision,
        now,
      })
    )
      throw new ApprovalOperationError("STATE_CONFLICT", "审批状态已更新，请刷新后重试", 409);
    const decision: ApprovalDecisionRecord = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      recommendationId: recommendation.id,
      recommendationVersion: recommendation.currentVersion,
      actorId: actor.id,
      decision: input.action,
      reason: safeReason,
      policyId: input.policy?.id ?? null,
      policyVersion: input.policy?.version ?? null,
      correlationId: safeCorrelation,
      createdAt: now,
    };
    this.repository.appendDecision(decision);
    this.repository.appendApprovalAudit({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorType: actor.kind === "human" ? "user" : "system",
      actorId: actor.id,
      action: `approval.${input.action}`,
      targetId: recommendation.id,
      reason: safeReason,
      policyVersion: input.policy ? `${input.policy.id}:${input.policy.version}` : null,
      correlationId: safeCorrelation,
      metadata: {
        recommendationVersion: recommendation.currentVersion,
        fromState: recommendation.state,
        toState: nextState[input.action],
        stateRevision: recommendation.stateRevision + 1,
      },
      occurredAt: now,
    });
    return { decision, state: nextState[input.action], stateRevision: recommendation.stateRevision + 1 };
  }

  private authorize(actor: ApprovalOperationActor, organizationId: string, projectId: string, allowSystem: boolean) {
    if (!actor.active) throw new ApprovalOperationError("FORBIDDEN", "审批操作者不可用", 403);
    if (actor.organizationId !== organizationId)
      throw new ApprovalOperationError("TENANT_MISMATCH", "不能操作其他组织的审批", 403);
    if (actor.projectIds !== "*" && !actor.projectIds.has(projectId))
      throw new ApprovalOperationError("PROJECT_FORBIDDEN", "没有当前项目的审批权限", 403);
    if (actor.kind === "system") {
      if (!allowSystem) throw new ApprovalOperationError("FORBIDDEN", "系统操作者不能执行人工审批", 403);
      return;
    }
    if (!actor.permissions.has("*") && !actor.permissions.has("approvals.decide"))
      throw new ApprovalOperationError("FORBIDDEN", "没有审批决策权限", 403);
  }

  private requiredRecommendation(organizationId: string, projectId: string, recommendationId: string) {
    const recommendation = this.repository.recommendation(organizationId, projectId, recommendationId);
    if (!recommendation) throw new ApprovalOperationError("NOT_FOUND", "审批建议不存在", 404);
    return recommendation;
  }
}
