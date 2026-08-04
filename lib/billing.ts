import { ensureProductSchema } from "./product";
import { getDatabase, type AppUser } from "./auth";

export type BillingPlan = {
  id: AppUser["plan"];
  name: string;
  monthlyPriceCents: number;
  projectLimit: number;
  monthlyPageLimit: number;
  aiCreditLimit: number;
  contentLimit: number | null;
  teamSeatLimit: number;
  agents: number;
  scheduledTasks: string;
  retentionDays: number;
  apiAccess: boolean;
};

export const billingPlans: Record<AppUser["plan"], BillingPlan> = {
  trial: { id:"trial", name:"试用版", monthlyPriceCents:0, projectLimit:1, monthlyPageLimit:100, aiCreditLimit:1000, contentLimit:10, teamSeatLimit:1, agents:3, scheduledTasks:"手动", retentionDays:7, apiAccess:false },
  starter: { id:"starter", name:"Starter", monthlyPriceCents:3500, projectLimit:3, monthlyPageLimit:10000, aiCreditLimit:5000, contentLimit:50, teamSeatLimit:3, agents:5, scheduledTasks:"每日 1 次", retentionDays:30, apiAccess:false },
  pro: { id:"pro", name:"Pro", monthlyPriceCents:9800, projectLimit:10, monthlyPageLimit:100000, aiCreditLimit:15000, contentLimit:null, teamSeatLimit:15, agents:7, scheduledTasks:"不限", retentionDays:365, apiAccess:true },
  business: { id:"business", name:"Business", monthlyPriceCents:23800, projectLimit:100, monthlyPageLimit:500000, aiCreditLimit:50000, contentLimit:null, teamSeatLimit:100, agents:7, scheduledTasks:"不限", retentionDays:730, apiAccess:true },
};

export async function ensureBillingSchema(): Promise<void> {
  await ensureProductSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK(status IN ('draft','open','paid','void','uncollectible')),
      provider_invoice_id TEXT,
      download_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_invoices_user_idx ON billing_invoices(user_id, created_at);
    CREATE TABLE IF NOT EXISTS billing_payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      brand TEXT NOT NULL,
      last4 TEXT NOT NULL,
      expiry_month INTEGER NOT NULL,
      expiry_year INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_methods_user_idx ON billing_payment_methods(user_id, is_default);
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events(user_id, created_at);
  `);
}

export function billingProviderConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.PAYMENT_PROVIDER_SECRET);
}
