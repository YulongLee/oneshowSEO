import { getDatabase } from "./auth";
import { ensureProductSchema } from "./product";

export type ApprovalAction = "approve"|"reject"|"request_changes"|"defer"|"schedule";

export async function ensureApprovalSchema():Promise<void>{
 await ensureProductSchema();
 getDatabase().exec(`
  CREATE TABLE IF NOT EXISTS approval_decisions (
   id TEXT PRIMARY KEY,
   task_id TEXT NOT NULL REFERENCES seo_tasks(id) ON DELETE CASCADE,
   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   action TEXT NOT NULL CHECK(action IN ('approve','reject','request_changes','defer','schedule')),
   note TEXT,
   scheduled_for INTEGER,
   created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS approval_decisions_task_idx ON approval_decisions(task_id,created_at);
  CREATE INDEX IF NOT EXISTS approval_decisions_user_idx ON approval_decisions(user_id,created_at);
 `);
}

export function approvalRisk(priority:number):"high"|"medium"|"low"{
 return priority>=80?"high":priority>=50?"medium":"low";
}

export function approvalDeadline(createdAt:number):number{return createdAt+7*24*60*60}
