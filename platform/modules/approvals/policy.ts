import type { ApprovalPolicy, ApprovalRisk } from "./model";

export type ApprovalPolicyActor = {
  id: string;
  kind: "human" | "service";
  organizationId: string;
  active: boolean;
  projectIds: ReadonlySet<string> | "*";
  permissions: ReadonlySet<string>;
};

export type ApprovalEntitlementSnapshot = {
  organizationId: string;
  access: "active" | "grace" | "restricted" | "suspended";
  capabilities: ReadonlySet<string>;
  version: number;
  validUntil: number | null;
};

export type ApprovalPolicyInput = {
  organizationId: string;
  projectId: string;
  capability: string;
  environment: "production" | "staging";
  risk: ApprovalRisk;
  actor: ApprovalPolicyActor;
  requiredPermission: string;
  entitlement: ApprovalEntitlementSnapshot;
  expiresAt: number;
};

export type ApprovalPolicyReason =
  | "ACTOR_INACTIVE"
  | "ACTOR_TENANT_MISMATCH"
  | "ACTOR_PROJECT_FORBIDDEN"
  | "ACTOR_PERMISSION_MISSING"
  | "ENTITLEMENT_TENANT_MISMATCH"
  | "ENTITLEMENT_RESTRICTED"
  | "ENTITLEMENT_EXPIRED"
  | "ENTITLEMENT_CAPABILITY_MISSING"
  | "RECOMMENDATION_EXPIRED"
  | "POLICY_DENIED"
  | "EXPLICIT_HUMAN_APPROVAL_REQUIRED"
  | "POLICY_REQUIRES_APPROVAL"
  | "POLICY_ALLOWED"
  | "SAFE_DEFAULT_REQUIRES_APPROVAL";

export type ApprovalPolicyResult = {
  action: "allow" | "require_approval" | "deny";
  reason: ApprovalPolicyReason;
  policy: { id: string; version: number } | null;
  entitlementVersion: number;
  requiresHuman: boolean;
};

export interface ApprovalPolicyRepository {
  activePolicies(organizationId: string, projectId: string): ApprovalPolicy[];
}

const actionSafety = { allow: 0, require_approval: 1, deny: 2 } as const;
const defaultAlwaysHumanCapabilities = new Set([
  "content.publish",
  "content.delete",
  "site.indexing.update",
  "integration.credentials.update",
]);

function policySpecificity(policy: ApprovalPolicy, input: ApprovalPolicyInput) {
  if (policy.organizationId !== input.organizationId) return -1;
  if (policy.projectId !== null && policy.projectId !== input.projectId) return -1;
  if (policy.capability !== null && policy.capability !== input.capability) return -1;
  if (policy.environment !== input.environment || policy.risk !== input.risk || !policy.active) return -1;
  return Number(policy.projectId !== null) * 2 + Number(policy.capability !== null);
}

export class ApprovalPolicyEvaluator {
  constructor(
    private readonly repository: ApprovalPolicyRepository,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    private readonly alwaysHumanCapabilities: ReadonlySet<string> = defaultAlwaysHumanCapabilities,
  ) {}

  evaluate(input: ApprovalPolicyInput): ApprovalPolicyResult {
    const deny = (reason: ApprovalPolicyReason): ApprovalPolicyResult => ({
      action: "deny",
      reason,
      policy: null,
      entitlementVersion: input.entitlement.version,
      requiresHuman: false,
    });
    if (!input.actor.active) return deny("ACTOR_INACTIVE");
    if (input.actor.organizationId !== input.organizationId) return deny("ACTOR_TENANT_MISMATCH");
    if (input.actor.projectIds !== "*" && !input.actor.projectIds.has(input.projectId)) return deny("ACTOR_PROJECT_FORBIDDEN");
    if (!input.actor.permissions.has("*") && !input.actor.permissions.has(input.requiredPermission)) return deny("ACTOR_PERMISSION_MISSING");
    if (input.entitlement.organizationId !== input.organizationId) return deny("ENTITLEMENT_TENANT_MISMATCH");
    if (input.entitlement.access !== "active" && input.entitlement.access !== "grace") return deny("ENTITLEMENT_RESTRICTED");
    const now = this.now();
    if (input.entitlement.validUntil !== null && input.entitlement.validUntil <= now) return deny("ENTITLEMENT_EXPIRED");
    if (!input.entitlement.capabilities.has("*") && !input.entitlement.capabilities.has(input.capability)) return deny("ENTITLEMENT_CAPABILITY_MISSING");
    if (input.expiresAt <= now) return deny("RECOMMENDATION_EXPIRED");

    const candidates = this.repository
      .activePolicies(input.organizationId, input.projectId)
      .map((policy) => ({ policy, specificity: policySpecificity(policy, input) }))
      .filter(({ specificity }) => specificity >= 0)
      .sort(
        (left, right) =>
          right.specificity - left.specificity ||
          actionSafety[right.policy.action] - actionSafety[left.policy.action] ||
          right.policy.version - left.policy.version ||
          left.policy.id.localeCompare(right.policy.id),
      );
    const selected = candidates[0]?.policy ?? null;
    const policy = selected ? { id: selected.id, version: selected.version } : null;

    if (selected?.action === "deny") {
      return { action: "deny", reason: "POLICY_DENIED", policy, entitlementVersion: input.entitlement.version, requiresHuman: false };
    }
    const foundationHighRisk = input.risk === "high" || input.risk === "critical" || this.alwaysHumanCapabilities.has(input.capability);
    if (foundationHighRisk) {
      return {
        action: "require_approval",
        reason: "EXPLICIT_HUMAN_APPROVAL_REQUIRED",
        policy,
        entitlementVersion: input.entitlement.version,
        requiresHuman: true,
      };
    }
    if (selected?.action === "allow") {
      return { action: "allow", reason: "POLICY_ALLOWED", policy, entitlementVersion: input.entitlement.version, requiresHuman: false };
    }
    if (selected?.action === "require_approval") {
      return {
        action: "require_approval",
        reason: "POLICY_REQUIRES_APPROVAL",
        policy,
        entitlementVersion: input.entitlement.version,
        requiresHuman: true,
      };
    }
    return {
      action: "require_approval",
      reason: "SAFE_DEFAULT_REQUIRES_APPROVAL",
      policy: null,
      entitlementVersion: input.entitlement.version,
      requiresHuman: true,
    };
  }
}
