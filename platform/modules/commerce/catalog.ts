export type PlanKey = "trial" | "starter" | "pro" | "business";
export type CurrencyCode = "USD";
export type SupportLevel = "community" | "standard" | "priority" | "dedicated";

export type PlanEntitlements = {
  projects: number;
  seats: number;
  agents: number;
  pagesPerAudit: number;
  pagesPerMonth: number;
  keywords: number;
  apiRequests: number;
  apiKeys: number;
  storageBytes: number;
  retentionDays: number;
  monthlyCredits: number;
  contentItems: number | null;
  scheduledRunsPerDay: number | null;
  apiAccess: boolean;
  integrations: boolean;
  support: SupportLevel;
};

export type CommercialPlan = {
  key: PlanKey;
  catalogVersion: string;
  priceVersion: string;
  name: { "zh-CN": string; "en-US": string };
  currency: CurrencyCode;
  monthlyPriceCents: number;
  trialDays: number;
  entitlements: PlanEntitlements;
};

export const PLAN_CATALOG_VERSION = "2026-08-05";
export const PRICE_VERSION = "usd-2026-08-05";

const gib = 1024 * 1024 * 1024;

export const planCatalog: Record<PlanKey, CommercialPlan> = {
  trial: {
    key: "trial", catalogVersion: PLAN_CATALOG_VERSION, priceVersion: PRICE_VERSION,
    name: { "zh-CN": "试用版", "en-US": "Trial" }, currency: "USD", monthlyPriceCents: 0, trialDays: 14,
    entitlements: { projects:1,seats:1,agents:3,pagesPerAudit:10,pagesPerMonth:100,keywords:50,apiRequests:0,apiKeys:0,storageBytes:gib,retentionDays:7,monthlyCredits:1000,contentItems:10,scheduledRunsPerDay:0,apiAccess:false,integrations:false,support:"community" },
  },
  starter: {
    key: "starter", catalogVersion: PLAN_CATALOG_VERSION, priceVersion: PRICE_VERSION,
    name: { "zh-CN": "Starter", "en-US": "Starter" }, currency: "USD", monthlyPriceCents: 3500, trialDays: 0,
    entitlements: { projects:3,seats:3,agents:5,pagesPerAudit:50,pagesPerMonth:10000,keywords:500,apiRequests:0,apiKeys:0,storageBytes:5*gib,retentionDays:30,monthlyCredits:5000,contentItems:50,scheduledRunsPerDay:1,apiAccess:false,integrations:true,support:"standard" },
  },
  pro: {
    key: "pro", catalogVersion: PLAN_CATALOG_VERSION, priceVersion: PRICE_VERSION,
    name: { "zh-CN": "Pro", "en-US": "Pro" }, currency: "USD", monthlyPriceCents: 9800, trialDays: 0,
    entitlements: { projects:10,seats:15,agents:7,pagesPerAudit:250,pagesPerMonth:100000,keywords:5000,apiRequests:15000,apiKeys:3,storageBytes:25*gib,retentionDays:365,monthlyCredits:15000,contentItems:null,scheduledRunsPerDay:null,apiAccess:true,integrations:true,support:"priority" },
  },
  business: {
    key: "business", catalogVersion: PLAN_CATALOG_VERSION, priceVersion: PRICE_VERSION,
    name: { "zh-CN": "Business", "en-US": "Business" }, currency: "USD", monthlyPriceCents: 23800, trialDays: 0,
    entitlements: { projects:100,seats:100,agents:7,pagesPerAudit:1000,pagesPerMonth:500000,keywords:50000,apiRequests:100000,apiKeys:10,storageBytes:100*gib,retentionDays:730,monthlyCredits:50000,contentItems:null,scheduledRunsPerDay:null,apiAccess:true,integrations:true,support:"dedicated" },
  },
};

export function commercialPlan(value: string): CommercialPlan {
  return planCatalog[value as PlanKey] ?? planCatalog.trial;
}
