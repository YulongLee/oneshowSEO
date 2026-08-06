export type ApprovalRisk = "low" | "medium" | "high" | "critical";
export type RecommendationState =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "deferred"
  | "expired"
  | "executing"
  | "verified"
  | "failed"
  | "rolled_back";

export type ApprovalRecommendation = {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  agentKey: string;
  agentVersion: string;
  capability: string;
  state: RecommendationState;
  stateRevision: number;
  currentVersion: number;
  risk: ApprovalRisk;
  confidence: number;
  estimatedCost: number;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};
export type RecommendationVersion = {
  recommendationId: string;
  version: number;
  title: string;
  impactHypothesis: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  createdBy: string;
  createdAt: number;
};
export type ApprovalEvidenceRef = {
  id: string;
  organizationId: string;
  projectId: string;
  recommendationId: string;
  kind: "artifact" | "integration" | "public";
  referenceId: string;
  digest: string;
  capturedAt: number;
  expiresAt: number;
  provenance: Record<string, unknown>;
  createdAt: number;
};
export type ApprovalChangeSet = {
  id: string;
  recommendationId: string;
  version: number;
  targetType: string;
  targetRef: string;
  beforeHash: string;
  afterHash: string;
  operations: unknown[];
  rollbackRequired: boolean;
  createdAt: number;
};
export type ApprovalPolicy = {
  id: string;
  organizationId: string;
  projectId: string | null;
  capability: string | null;
  environment: "production" | "staging";
  risk: ApprovalRisk;
  action: "allow" | "require_approval" | "deny";
  version: number;
  active: boolean;
  createdAt: number;
};
export type ApprovalDecisionRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  recommendationId: string;
  recommendationVersion: number;
  actorId: string;
  actorType: "human" | "system" | "unknown";
  decision: "approve" | "reject" | "request_changes" | "defer" | "expire";
  reason: string;
  policyId: string | null;
  policyVersion: number | null;
  correlationId: string;
  createdAt: number;
};
export type ApprovalAssignment = {
  id: string;
  recommendationId: string;
  membershipId: string;
  revision: number;
  assignedBy: string;
  createdAt: number;
  updatedAt: number;
};
export type ApprovalExecution = {
  id: string;
  organizationId: string;
  projectId: string;
  recommendationId: string;
  decisionId: string;
  taskId: string;
  state: "queued" | "running" | "completed" | "failed";
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
};
export type ApprovalVerification = {
  id: string;
  executionId: string;
  state: "pending" | "passed" | "failed";
  evidenceRefId: string | null;
  verifiedAt: number | null;
  createdAt: number;
};
export type ApprovalRollback = {
  id: string;
  executionId: string;
  state: "available" | "requested" | "running" | "completed" | "failed";
  artifactRefId: string | null;
  requestedBy: string | null;
  createdAt: number;
  updatedAt: number;
};
