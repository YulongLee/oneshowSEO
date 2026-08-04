import type { OrganizationId, ProjectId, UserId } from "../../core/ids";

export type FeatureFlagScope = "global"|"environment"|"plan"|"organization"|"project"|"capability"|"agent";

export type FeatureFlagRule = {
  id: string;
  key: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  scopeValue: string;
  version: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type FeatureFlagSubject = {
  environment: string;
  plan?: string;
  organizationId?: OrganizationId;
  projectId?: ProjectId;
  capability?: string;
  agent?: string;
};

export type FeatureFlagChange = {
  key: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  scopeValue: string;
  expectedVersion?: number;
  reason: string;
  actorId: UserId;
  correlationId: string;
};

export interface FeatureFlagRepository {
  activeRules(key: string): Promise<FeatureFlagRule[]>;
  upsert(change: FeatureFlagChange): Promise<FeatureFlagRule>;
}

const scopeWeight: Record<FeatureFlagScope,number> = {global:0,environment:10,plan:20,organization:30,project:40,capability:50,agent:60};

function matches(rule: FeatureFlagRule, subject: FeatureFlagSubject): boolean {
  if (!rule.active) return false;
  if (rule.scope === "global") return rule.scopeValue === "*";
  if (rule.scope === "environment") return rule.scopeValue === subject.environment;
  if (rule.scope === "plan") return rule.scopeValue === subject.plan;
  if (rule.scope === "organization") return rule.scopeValue === subject.organizationId;
  if (rule.scope === "project") return rule.scopeValue === subject.projectId;
  if (rule.scope === "capability") return rule.scopeValue === subject.capability;
  return rule.scopeValue === subject.agent;
}

export function resolveFeatureFlag(rules: readonly FeatureFlagRule[], subject: FeatureFlagSubject, defaultValue = false): boolean {
  const match = rules.filter(rule => matches(rule,subject)).sort((a,b) => scopeWeight[a.scope]-scopeWeight[b.scope] || a.updatedAt-b.updatedAt).at(-1);
  return match?.enabled ?? defaultValue;
}

export class FeatureFlagService {
  constructor(private readonly repository: FeatureFlagRepository, private readonly environment = process.env.NODE_ENV || "development") {}
  async enabled(key: string, subject: Omit<FeatureFlagSubject,"environment">, defaultValue = false): Promise<boolean> {
    const rules = await this.repository.activeRules(key);
    return resolveFeatureFlag(rules,{...subject,environment:this.environment},defaultValue);
  }
  change(input: FeatureFlagChange): Promise<FeatureFlagRule> { return this.repository.upsert(input); }
}
