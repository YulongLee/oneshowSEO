import type { AppDatabase } from "../../../lib/database";
import type { ReleaseRollout, ReleaseRolloutRepository, RolloutChange } from "../../modules/operations/release-rollout";

type Row = {id:string;release:string;capability:string;phase:ReleaseRollout["phase"];cohort:string;featureFlagKey:string;gatesJson:string;observationJson:string;reason:string;actorId:string;correlationId:string;version:number;createdAt:number;updatedAt:number};
const record=(row:Row):ReleaseRollout=>({...row,gates:JSON.parse(row.gatesJson),observation:JSON.parse(row.observationJson)});

export class SqliteReleaseRolloutRepository implements ReleaseRolloutRepository {
  constructor(private readonly database: AppDatabase){this.ensureSchema();}
  private ensureSchema(){this.database.exec(`
    CREATE TABLE IF NOT EXISTS platform_release_rollouts(
      id TEXT PRIMARY KEY,release TEXT NOT NULL,capability TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN('off','internal','canary','paid','paused')),cohort TEXT NOT NULL,feature_flag_key TEXT NOT NULL,gates_json TEXT NOT NULL,observation_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL,correlation_id TEXT NOT NULL,version INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(release,capability)
    );
    CREATE TABLE IF NOT EXISTS platform_release_rollout_events(
      id TEXT PRIMARY KEY,rollout_id TEXT NOT NULL,release TEXT NOT NULL,capability TEXT NOT NULL,from_phase TEXT NOT NULL,to_phase TEXT NOT NULL,cohort TEXT NOT NULL,evidence_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL,correlation_id TEXT NOT NULL,created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS platform_release_rollout_events_lookup_idx ON platform_release_rollout_events(release,capability,created_at);
  `);}
  async current(release:string,capability:string){const row=this.database.prepare(`SELECT id,release,capability,phase,cohort,feature_flag_key featureFlagKey,gates_json gatesJson,observation_json observationJson,reason,actor_id actorId,correlation_id correlationId,version,created_at createdAt,updated_at updatedAt FROM platform_release_rollouts WHERE release=? AND capability=?`).bind(release,capability).first<Row>();return row?record(row):null;}
  async save(change:RolloutChange){const now=Math.floor(Date.now()/1000),previous=await this.current(change.release,change.capability);if(change.expectedVersion!==undefined&&(previous?.version??0)!==change.expectedVersion)throw new Error("ROLLOUT_VERSION_CONFLICT");const id=previous?.id??crypto.randomUUID(),version=(previous?.version??0)+1,createdAt=previous?.createdAt??now,gatesJson=JSON.stringify(change.gates),observationJson=JSON.stringify(change.observation);this.database.batch([
    this.database.prepare(`INSERT INTO platform_release_rollouts(id,release,capability,phase,cohort,feature_flag_key,gates_json,observation_json,reason,actor_id,correlation_id,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(release,capability) DO UPDATE SET phase=excluded.phase,cohort=excluded.cohort,feature_flag_key=excluded.feature_flag_key,gates_json=excluded.gates_json,observation_json=excluded.observation_json,reason=excluded.reason,actor_id=excluded.actor_id,correlation_id=excluded.correlation_id,version=excluded.version,updated_at=excluded.updated_at`).bind(id,change.release,change.capability,change.phase,change.cohort,change.featureFlagKey,gatesJson,observationJson,change.reason,change.actorId,change.correlationId,version,createdAt,now),
    this.database.prepare(`INSERT INTO platform_release_rollout_events(id,rollout_id,release,capability,from_phase,to_phase,cohort,evidence_json,reason,actor_id,correlation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,change.release,change.capability,previous?.phase??"off",change.phase,change.cohort,gatesJson,change.reason,change.actorId,change.correlationId,now)
  ]);return{id,release:change.release,capability:change.capability,phase:change.phase,cohort:change.cohort,featureFlagKey:change.featureFlagKey,gates:change.gates,observation:change.observation,reason:change.reason,actorId:change.actorId,correlationId:change.correlationId,version,createdAt,updatedAt:now};}
}
