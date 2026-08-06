import { SqliteAgentRegistryRepository } from "../platform/adapters/sqlite/agent-registry-repository";
import { AgentRegistryService, AllowlistedAgentFeatureGate } from "../platform/modules/agents/registry";
import { getDatabase } from "./auth";import { ensureExecutionSchema } from "./execution";
let service:AgentRegistryService|undefined;
export async function agentRegistry(){await ensureExecutionSchema();const repository=new SqliteAgentRegistryRepository(getDatabase());repository.ensureSchema();const allowed=new Set((process.env.AGENT_FEATURE_ALLOWLIST||"").split(",").map(item=>item.trim()).filter(Boolean));return service??=new AgentRegistryService(repository,new AllowlistedAgentFeatureGate(allowed));}
