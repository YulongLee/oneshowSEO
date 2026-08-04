export const projectStatuses = ["active", "archived", "pending_deletion"] as const;
export type ProjectStatus = typeof projectStatuses[number];

export const projectMarkets = ["CN", "US", "GLOBAL"] as const;
export const projectLocales = ["zh-CN", "en-US"] as const;
export const projectApprovalModes = ["required", "low_risk_auto"] as const;
export const projectGoals = ["organic_growth", "rank_growth", "ai_visibility", "brand_mentions", "backlinks", "conversions"] as const;
export const supportedSearchEngines = ["google", "bing", "baidu"] as const;

export class ProjectGovernanceError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "CONFLICT" | "LIMIT_REACHED" | "DELETE_BLOCKED" | "NOT_FOUND",
    message: string,
    readonly status: number,
  ) { super(message); }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 0;
}

export function canonicalProjectUrl(value: unknown): { siteUrl: string; host: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw))) {
    throw new ProjectGovernanceError("INVALID_REQUEST", "网站地址格式不正确", 400);
  }
  let parsed: URL;
  try { parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new ProjectGovernanceError("INVALID_REQUEST", "网站地址格式不正确", 400); }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !host || host === "localhost" || host.endsWith(".localhost") || host === "::1" || isPrivateIpv4(host)) {
    throw new ProjectGovernanceError("INVALID_REQUEST", "网站地址必须是可公开访问的 HTTP 或 HTTPS 域名", 400);
  }
  parsed.hostname = host;
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return { siteUrl: parsed.toString(), host };
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}

export function normalizeProjectSettings(input: Record<string, unknown>, current?: {
  market: string; language: string; timezone: string; businessGoal: string; approvalMode: string;
}) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (name.length < 2) throw new ProjectGovernanceError("INVALID_REQUEST", "项目名称至少需要 2 个字符", 400);
  const url = canonicalProjectUrl(input.siteUrl);
  const market = oneOf(input.market, projectMarkets, oneOf(current?.market, projectMarkets, "CN"));
  const language = oneOf(input.language, projectLocales, oneOf(current?.language, projectLocales, "zh-CN"));
  const timezoneDefault = market === "CN" ? "Asia/Shanghai" : market === "US" ? "America/New_York" : "UTC";
  const timezoneCandidate = typeof input.timezone === "string" ? input.timezone.trim() : current?.timezone || timezoneDefault;
  const timezone = timezoneCandidate === "UTC" || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(timezoneCandidate) ? timezoneCandidate : timezoneDefault;
  const businessGoal = oneOf(input.businessGoal, projectGoals, oneOf(current?.businessGoal, projectGoals, "organic_growth"));
  const approvalMode = oneOf(input.approvalMode, projectApprovalModes, oneOf(current?.approvalMode, projectApprovalModes, "required"));
  const rawEngines = Array.isArray(input.searchEngines) ? input.searchEngines : market === "CN" ? ["google", "bing", "baidu"] : ["google", "bing"];
  const searchEngines = [...new Set(rawEngines.filter((value): value is typeof supportedSearchEngines[number] => typeof value === "string" && supportedSearchEngines.includes(value as typeof supportedSearchEngines[number])))];
  if (!searchEngines.length) throw new ProjectGovernanceError("INVALID_REQUEST", "至少选择一个搜索引擎", 400);
  const businessType = typeof input.businessType === "string" && input.businessType.trim() ? input.businessType.trim().slice(0, 50) : "website";
  const scheduleEnabled = input.scheduleEnabled === true || input.scheduleEnabled === 1 ? 1 : 0;
  return { name, ...url, market, language, timezone, businessGoal, approvalMode, searchEngines, businessType, scheduleEnabled };
}

export function projectSlug(host: string, id: string): string {
  return `${host.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project"}-${id.replaceAll("-", "").slice(0, 8)}`;
}

export function assertProjectVersion(expected: unknown, current: number): void {
  if (!Number.isInteger(expected) || Number(expected) !== current) {
    throw new ProjectGovernanceError("CONFLICT", "项目已被其他成员更新，请刷新后重试", 409);
  }
}

export function assertDeletionConfirmation(confirmation: unknown, project: { name: string; host: string }): void {
  if (confirmation !== project.name && confirmation !== project.host) {
    throw new ProjectGovernanceError("INVALID_REQUEST", `请输入完整项目名称或域名 ${project.host} 以确认`, 400);
  }
}
