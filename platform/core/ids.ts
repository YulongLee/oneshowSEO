declare const brand: unique symbol;

export type BrandedId<Name extends string> = string & { readonly [brand]: Name };

export type UserId = BrandedId<"UserId">;
export type OrganizationId = BrandedId<"OrganizationId">;
export type ProjectId = BrandedId<"ProjectId">;
export type MembershipId = BrandedId<"MembershipId">;
export type TaskId = BrandedId<"TaskId">;
export type JobId = BrandedId<"JobId">;
export type AgentRunId = BrandedId<"AgentRunId">;
export type ApprovalId = BrandedId<"ApprovalId">;
export type IntegrationId = BrandedId<"IntegrationId">;
export type ArtifactId = BrandedId<"ArtifactId">;
export type ApiClientId = BrandedId<"ApiClientId">;
export type CorrelationId = BrandedId<"CorrelationId">;

export function asId<Name extends string>(value: string, name: Name): BrandedId<Name> {
  const normalized = value.trim();
  if (!normalized) throw new Error(`INVALID_${name.toUpperCase()}`);
  return normalized as BrandedId<Name>;
}

export function newId<Name extends string>(name: Name): BrandedId<Name> {
  return asId(crypto.randomUUID(), name);
}
