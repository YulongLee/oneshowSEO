import { verifiedWordpressPublication } from "./wordpress-publication";
import { getDatabase } from "./auth";
import { ensureProductSchema } from "./product";
import { SqliteIntegrationConnectionRepository } from "../platform/adapters/sqlite/integration-connection-repository";
import { IntegrationConnectionService } from "../platform/modules/integrations/connections";
import { wordpressAdapter,type ProviderCredentialResolver,type ProviderHttpClient } from "../platform/modules/integrations/launch-adapters";
import { SafeProviderHttpClient,type SafeHttpRequest } from "../platform/modules/integrations/safe-http";
import { integrationSecretVault } from "../platform/modules/integrations/vault";

export async function integrationRepository(){await ensureProductSchema();const repository=new SqliteIntegrationConnectionRepository(getDatabase());repository.ensureSchema();return repository;}

async function runtimeDependencies(){const repository=await integrationRepository(),vault=integrationSecretVault();const credentials:ProviderCredentialResolver={async withAuthorization<T>(handle:string,operation:(authorization:string)=>Promise<T>){const record=repository.credentialContext(handle);if(!record)throw new Error("INTEGRATION_CREDENTIAL_UNAVAILABLE");return vault.withDecrypted(record.encryptedEnvelope,{organizationId:record.organizationId,projectId:record.projectId,connectionId:record.connectionId,recordId:record.id,recordVersion:record.recordVersion,purpose:"provider_credential"},secret=>operation(new TextDecoder().decode(secret)));}};const clients=new Map<string,SafeProviderHttpClient>();const http:ProviderHttpClient={async request(input:SafeHttpRequest){const url=new URL(input.url);let client=clients.get(url.hostname);if(!client){client=new SafeProviderHttpClient({allowedHosts:[url.hostname],credentialHosts:[url.hostname],timeoutMs:10_000,maxRedirects:2,maxRetries:2,maxResponseBytes:2_000_000,circuitFailureThreshold:3,circuitResetSeconds:60});clients.set(url.hostname,client);}return client.request(input);}};return{repository,vault,credentials,http};}

export async function integrationRuntime(){const{repository,vault,credentials,http}=await runtimeDependencies(),adapters=new Map([["wordpress",wordpressAdapter(http,credentials)]]);return{repository,service:new IntegrationConnectionService(repository,vault,adapters)};}

export async function publishWordpressPost(input:{organizationId:string;projectId:string;connectionId:string;title:string;slug:string;excerpt:string;html:string;contentHash:string;correlationId:string;publicationKey?:string;signal?:AbortSignal}){
 const{repository,credentials,http}=await runtimeDependencies(),connection=repository.connection(input.organizationId,input.projectId,input.connectionId);if(!connection||connection.providerId!=="wordpress"||connection.state!=="connected")throw new Error("PUBLISH_CONNECTION_UNAVAILABLE");if(!connection.grantedScopes.includes("content.write"))throw new Error("PUBLISH_SCOPE_REQUIRED");const credential=repository.credential(connection.id);if(!credential||credential.revokedAt)throw new Error("PUBLISH_CREDENTIAL_UNAVAILABLE");
 const base=connection.metadata.baseUrl?.replace(/\/$/,"");if(!base)throw new Error("PUBLISH_BASE_URL_REQUIRED");
 return verifiedWordpressPublication(getDatabase(),{...input,base,key:`${input.organizationId}:${input.projectId}:${input.connectionId}:${input.publicationKey||input.contentHash}`},request=>credentials.withAuthorization(credential.id,authorization=>http.request({...request,credentialHeaders:{Authorization:authorization}})));
}
