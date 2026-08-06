import { SqliteAgentRegistryRepository } from "../platform/adapters/sqlite/agent-registry-repository";
import { SqliteAgentFeatureGate } from "../platform/adapters/sqlite/agent-feature-gate";
import { AgentRegistryService } from "../platform/modules/agents/registry";
import { getDatabase } from "./auth";import { ensureExecutionSchema } from "./execution";
let service:AgentRegistryService|undefined;
export async function agentRegistry(){await ensureExecutionSchema();const db=getDatabase(),repository=new SqliteAgentRegistryRepository(db);repository.ensureSchema();const allowed=new Set((process.env.AGENT_FEATURE_ALLOWLIST||"").split(",").map(item=>item.trim()).filter(Boolean)),gate=new SqliteAgentFeatureGate(db,process.env.NODE_ENV||"development",allowed);return service??=new AgentRegistryService(repository,gate);}
