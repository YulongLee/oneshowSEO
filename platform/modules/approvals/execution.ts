import { createHash } from "node:crypto";
import type { CommercialSubject } from "../commerce";
import type { PlanEntitlements } from "../commerce/catalog";
import type { ExternalEffectRecord } from "../execution";
import type { AtomicTaskCreationInput, AtomicTaskCreationResult } from "../execution/task-creation";
import type { OrganizationRoleKey, Permission } from "../identity/authorization";
import type {
  ApprovalChangeSet,
  ApprovalDecisionRecord,
  ApprovalExecution,
  ApprovalRecommendation,
  ApprovalRollback,
  ApprovalVerification,
} from "./model";

export interface ApprovedTaskCreator {
  create(input: AtomicTaskCreationInput): AtomicTaskCreationResult;
}
export interface ApprovalEffectWriter {
  appendExternalEffect(effect: ExternalEffectRecord): void;
}
export interface ApprovalExecutionRepository {
  transaction<T>(operation: () => T): T;
  recommendation(organizationId: string, projectId: string, recommendationId: string): ApprovalRecommendation | null;
  approvedDecision(organizationId: string, projectId: string, recommendationId: string): ApprovalDecisionRecord | null;
  changeSets(recommendationId: string, version: number): ApprovalChangeSet[];
  executionByIdempotency(organizationId: string, idempotencyKey: string): ApprovalExecution | null;
  appendApprovalExecution(record: ApprovalExecution): void;
  appendVerification(record: ApprovalVerification): void;
  appendRollback(record: ApprovalRollback): void;
  updateRecommendationState(input: {
    organizationId: string;
    projectId: string;
    recommendationId: string;
    state: "executing";
    expectedStateRevision: number;
    now: number;
  }): boolean;
}

export class ApprovalExecutionError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "NOT_FOUND" | "NOT_APPROVED" | "HUMAN_APPROVAL_REQUIRED" | "DECISION_VERSION_MISMATCH" | "CHANGE_SET_REQUIRED",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type ApprovedExecutionInput = {
  activeOrganizationId: string;
  organizationId: string;
  projectId: string;
  recommendationId: string;
  requestedByAccountId: string;
  role: OrganizationRoleKey;
  permission: Permission;
  subject: CommercialSubject;
  locale: "zh-CN" | "en";
  idempotencyKey: string;
  correlationId: string;
  entitlements: Array<{ key: keyof PlanEntitlements; quantity: number; currentUsage: number }>;
};

export type ApprovedExecutionResult = {
  execution: ApprovalExecution;
  task: AtomicTaskCreationResult["task"];
  reservationId: string | null;
  duplicate: boolean;
};

export class ApprovedExecutionService {
  constructor(
    private readonly approvals: ApprovalExecutionRepository,
    private readonly tasks: ApprovedTaskCreator,
    private readonly effects: ApprovalEffectWriter,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  execute(input: ApprovedExecutionInput): ApprovedExecutionResult {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey) || !input.correlationId.trim())
      throw new ApprovalExecutionError("INVALID_REQUEST", "批准执行参数无效", 400);
    return this.approvals.transaction(() => {
      const existing = this.approvals.executionByIdempotency(input.organizationId, input.idempotencyKey);
      if (existing) {
        const taskResult = this.tasks.create(this.taskInput(input, this.requiredRecommendation(input)));
        if (taskResult.task.id !== existing.taskId)
          throw new ApprovalExecutionError("INVALID_REQUEST", "审批执行幂等记录不一致", 409);
        return { execution: existing, task: taskResult.task, reservationId: taskResult.reservationId, duplicate: true };
      }
      const recommendation = this.requiredRecommendation(input);
      if (recommendation.state !== "approved") throw new ApprovalExecutionError("NOT_APPROVED", "建议尚未批准", 409);
      const decision = this.approvals.approvedDecision(input.organizationId, input.projectId, recommendation.id);
      if (!decision) throw new ApprovalExecutionError("NOT_APPROVED", "缺少有效批准决策", 409);
      if (decision.actorType !== "human")
        throw new ApprovalExecutionError("HUMAN_APPROVAL_REQUIRED", "该变更必须由授权人员明确批准", 409);
      if (decision.recommendationVersion !== recommendation.currentVersion)
        throw new ApprovalExecutionError("DECISION_VERSION_MISMATCH", "批准决策不属于当前建议版本", 409);
      const changeSets = this.approvals.changeSets(recommendation.id, recommendation.currentVersion);
      if (changeSets.length === 0) throw new ApprovalExecutionError("CHANGE_SET_REQUIRED", "批准执行缺少变更集", 409);
      const taskResult = this.tasks.create(this.taskInput(input, recommendation));
      const now = this.now();
      const execution: ApprovalExecution = {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        recommendationId: recommendation.id,
        decisionId: decision.id,
        taskId: taskResult.task.id,
        state: "queued",
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };
      this.approvals.appendApprovalExecution(execution);
      this.approvals.appendVerification({
        id: crypto.randomUUID(),
        executionId: execution.id,
        state: "pending",
        evidenceRefId: null,
        verifiedAt: null,
        createdAt: now,
      });
      if (changeSets.some((changeSet) => changeSet.rollbackRequired))
        this.approvals.appendRollback({
          id: crypto.randomUUID(),
          executionId: execution.id,
          state: "available",
          artifactRefId: null,
          requestedBy: null,
          createdAt: now,
          updatedAt: now,
        });
      for (const changeSet of changeSets) {
        this.effects.appendExternalEffect({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          taskId: taskResult.task.id,
          attemptId: null,
          provider: "approval-target",
          operation: `${changeSet.targetType}:${recommendation.capability}`,
          externalReference: null,
          requestHash: createHash("sha256")
            .update(`${recommendation.id}:${recommendation.currentVersion}:${changeSet.id}:${changeSet.afterHash}`)
            .digest("hex"),
          state: "pending",
          evidence: { recommendationId: recommendation.id, recommendationVersion: recommendation.currentVersion, changeSetId: changeSet.id },
          errorCode: null,
          idempotencyKey: `approval-effect:${input.idempotencyKey}:${changeSet.id}`,
          correlationId: input.correlationId,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (
        !this.approvals.updateRecommendationState({
          organizationId: input.organizationId,
          projectId: input.projectId,
          recommendationId: recommendation.id,
          state: "executing",
          expectedStateRevision: recommendation.stateRevision,
          now,
        })
      )
        throw new ApprovalExecutionError("NOT_APPROVED", "审批状态已更新，无法开始执行", 409);
      return { execution, task: taskResult.task, reservationId: taskResult.reservationId, duplicate: false };
    });
  }

  private requiredRecommendation(input: Pick<ApprovedExecutionInput, "organizationId" | "projectId" | "recommendationId">) {
    const recommendation = this.approvals.recommendation(input.organizationId, input.projectId, input.recommendationId);
    if (!recommendation) throw new ApprovalExecutionError("NOT_FOUND", "审批建议不存在", 404);
    return recommendation;
  }

  private taskInput(input: ApprovedExecutionInput, recommendation: ApprovalRecommendation): AtomicTaskCreationInput {
    return {
      activeOrganizationId: input.activeOrganizationId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      requestedByAccountId: input.requestedByAccountId,
      role: input.role,
      permission: input.permission,
      subject: input.subject,
      triggerType: "approval",
      taskType: "approved_change_execution",
      capability: recommendation.capability,
      input: {
        recommendationId: recommendation.id,
        recommendationVersion: recommendation.currentVersion,
      },
      locale: input.locale,
      idempotencyKey: `approval:${input.idempotencyKey}`,
      correlationId: input.correlationId,
      entitlements: input.entitlements,
      creditCost: Math.ceil(recommendation.estimatedCost),
      queue: "approval-execution",
      jobType: "approved-change",
      priority: recommendation.risk === "critical" ? 100 : recommendation.risk === "high" ? 90 : recommendation.risk === "medium" ? 60 : 40,
      maxAttempts: 3,
      timeoutSeconds: 900,
    };
  }
}
