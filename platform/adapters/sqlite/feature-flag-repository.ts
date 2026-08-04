import type { AppDatabase } from "../../../lib/database";
import type { FeatureFlagChange, FeatureFlagRepository, FeatureFlagRule } from "../../modules/operations/feature-flags";

type FlagRow = {id:string;key:string;enabled:number;scope:FeatureFlagRule["scope"];scopeValue:string;version:number;active:number;createdAt:number;updatedAt:number};

function record(row: FlagRow): FeatureFlagRule { return {...row,enabled:Boolean(row.enabled),active:Boolean(row.active)}; }

export class SqliteFeatureFlagRepository implements FeatureFlagRepository {
  constructor(private readonly database: AppDatabase) { this.ensureSchema(); }

  private ensureSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS platform_feature_flags (
        id TEXT PRIMARY KEY,
        flag_key TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        scope TEXT NOT NULL CHECK(scope IN ('global','environment','plan','organization','project','capability','agent')),
        scope_value TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(flag_key,scope,scope_value)
      );
      CREATE INDEX IF NOT EXISTS platform_feature_flags_lookup_idx ON platform_feature_flags(flag_key,active,scope,scope_value);
      CREATE TABLE IF NOT EXISTS platform_audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        organization_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        reason TEXT,
        outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
        detail TEXT,
        correlation_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS platform_audit_events_correlation_idx ON platform_audit_events(correlation_id,created_at);
    `);
  }

  async activeRules(key: string): Promise<FeatureFlagRule[]> {
    const rows = this.database.prepare(`
      SELECT id,flag_key AS key,enabled,scope,scope_value AS scopeValue,version,active,created_at AS createdAt,updated_at AS updatedAt
      FROM platform_feature_flags WHERE flag_key=? AND active=1
    `).bind(key).all<FlagRow>().results;
    return rows.map(record);
  }

  async upsert(change: FeatureFlagChange): Promise<FeatureFlagRule> {
    if (!change.reason.trim()) throw new Error("FEATURE_FLAG_REASON_REQUIRED");
    const now = Math.floor(Date.now()/1000);
    const existing = this.database.prepare(`
      SELECT id,flag_key AS key,enabled,scope,scope_value AS scopeValue,version,active,created_at AS createdAt,updated_at AS updatedAt
      FROM platform_feature_flags WHERE flag_key=? AND scope=? AND scope_value=? LIMIT 1
    `).bind(change.key,change.scope,change.scopeValue).first<FlagRow>();
    if (change.expectedVersion !== undefined && (existing?.version || 0) !== change.expectedVersion) throw new Error("FEATURE_FLAG_VERSION_CONFLICT");
    const id = existing?.id || crypto.randomUUID();
    const version = (existing?.version || 0)+1;
    const createdAt = existing?.createdAt || now;
    const detail = JSON.stringify({key:change.key,scope:change.scope,scopeValue:change.scopeValue,enabled:change.enabled,previousVersion:existing?.version||null,version});
    this.database.batch([
      this.database.prepare(`
        INSERT INTO platform_feature_flags (id,flag_key,enabled,scope,scope_value,version,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,?,?)
        ON CONFLICT(flag_key,scope,scope_value) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,active=1,updated_at=excluded.updated_at
      `).bind(id,change.key,change.enabled?1:0,change.scope,change.scopeValue,version,createdAt,now),
      this.database.prepare(`
        INSERT INTO platform_audit_events (id,actor_id,action,target_type,target_id,reason,outcome,detail,correlation_id,created_at)
        VALUES (?,?,?,'feature_flag',?,?,'success',?,?,?)
      `).bind(crypto.randomUUID(),change.actorId,"feature_flag.changed",id,change.reason,detail,change.correlationId,now),
    ]);
    return {id,key:change.key,enabled:change.enabled,scope:change.scope,scopeValue:change.scopeValue,version,active:true,createdAt,updatedAt:now};
  }
}
