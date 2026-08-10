import { SqliteAgentRegistryRepository } from "../platform/adapters/sqlite/agent-registry-repository";
import { SqliteAgentFeatureGate } from "../platform/adapters/sqlite/agent-feature-gate";
import { AgentRegistryError, AgentRegistryService } from "../platform/modules/agents/registry";
import { auditAgentManifest } from "../platform/modules/agents/audit-agent";
import { researchAgentManifest } from "../platform/modules/agents/research-agent";
import { geoAgentManifest } from "../platform/modules/agents/geo-agent";
import { getDatabase } from "./auth";
import { ensureBillingSchema } from "./billing";
import { ensureExecutionSchema } from "./execution";

let service:AgentRegistryService|undefined;
const builtInManifests=[researchAgentManifest,auditAgentManifest,geoAgentManifest];

export async function agentRegistry(){
  await ensureExecutionSchema();await ensureBillingSchema();
  const db=getDatabase(),repository=new SqliteAgentRegistryRepository(db);repository.ensureSchema();
  const allowed=new Set((process.env.AGENT_FEATURE_ALLOWLIST||"").split(",").map(item=>item.trim()).filter(Boolean)),gate=new SqliteAgentFeatureGate(db,process.env.NODE_ENV||"development",allowed),registry=service??=new AgentRegistryService(repository,gate);
  for(const manifest of builtInManifests)registry.publish(manifest);return registry;
}

export async function ensureBuiltInProjectAgents(organizationId:string,projectId:string){
  const registry=await agentRegistry();
  for(const manifest of builtInManifests){
    if(registry.list(organizationId,projectId).some(item=>item.agentKey===manifest.key))continue;
    const configure=(enabled:boolean)=>registry.configure({organizationId,projectId,agentKey:manifest.key,agentVersion:manifest.version,enabled,configuration:{sourcePolicy:"project_public_only",freshnessHours:24},expectedRevision:0});
    try{configure(true);}catch(error){
      if(error instanceof AgentRegistryError&&error.code==="CONFIGURATION_CONFLICT")continue;
      if(!(error instanceof AgentRegistryError)||error.code!=="AGENT_FEATURE_DISABLED")throw error;
      try{configure(false);}catch(fallback){if(!(fallback instanceof AgentRegistryError)||fallback.code!=="CONFIGURATION_CONFLICT")throw fallback;}
    }
  }
}
