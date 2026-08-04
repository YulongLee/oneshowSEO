import { ensureAuthSchema, getDatabase } from "./auth";

export const dataSourceDefinitions = {
  pagespeed: { name:"PageSpeed Insights", description:"移动端 Lighthouse 与实验室性能指标", fields:[{key:"apiKey",label:"API Key",secret:true,required:true}] },
  google_search_console: { name:"Google Search Console", description:"搜索表现、收录与 Sitemap 数据", fields:[{key:"serviceAccountJson",label:"Service Account JSON",secret:true,required:true}] },
  google_analytics_4: { name:"Google Analytics 4", description:"自然流量、参与度与转化数据", fields:[{key:"serviceAccountJson",label:"Service Account JSON",secret:true,required:true}] },
  baidu_search: { name:"百度搜索资源平台", description:"百度收录、抓取与站点提交能力", fields:[{key:"siteToken",label:"站点 Token",secret:true,required:true}] },
  dataforseo: { name:"DataForSEO", description:"关键词排名、SERP 与竞品数据", fields:[{key:"login",label:"API Login",secret:true,required:true},{key:"password",label:"API Password",secret:true,required:true}] },
  backlinks: { name:"外链数据服务", description:"引用域、外链质量与风险信号", fields:[{key:"apiToken",label:"API Token",secret:true,required:true}] },
  cms: { name:"CMS 发布网关", description:"已审批内容与页面变更的发布出口", fields:[{key:"baseUrl",label:"Webhook Base URL",secret:true,required:true},{key:"signingSecret",label:"Signing Secret",secret:true,required:true}] },
} as const;

export type DataSourceProvider = keyof typeof dataSourceDefinitions;
export type StoredDataSource = {provider:DataSourceProvider;enabled:boolean;configured:boolean;configuredFields:number;totalFields:number;lastTestStatus:string|null;lastTestedAt:number|null;lastError:string|null;updatedAt:number|null};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes:Uint8Array):string { return Buffer.from(bytes).toString("base64url"); }
function base64ToBytes(value:string):Uint8Array { return new Uint8Array(Buffer.from(value,"base64url")); }

async function encryptionKey():Promise<CryptoKey> {
  const secret=process.env.DATA_SOURCE_ENCRYPTION_KEY?.trim();
  if(!secret || secret.length<24) throw new Error("DATA_SOURCE_ENCRYPTION_KEY_MISSING");
  const digest=await crypto.subtle.digest("SHA-256",encoder.encode(secret));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}

export async function encryptDataSourceConfig(config:Record<string,string>):Promise<string> {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(),encoder.encode(JSON.stringify(config)));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptDataSourceConfig(value:string):Promise<Record<string,string>> {
  const [version,ivText,payloadText]=value.split(".");
  if(version!=="v1"||!ivText||!payloadText) throw new Error("DATA_SOURCE_CONFIG_INVALID");
  const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(ivText)},await encryptionKey(),base64ToBytes(payloadText));
  const parsed=JSON.parse(decoder.decode(decrypted)) as unknown;
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)) throw new Error("DATA_SOURCE_CONFIG_INVALID");
  return Object.fromEntries(Object.entries(parsed).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));
}

export async function ensureDataSourceSchema():Promise<void> {
  const db=getDatabase(); await ensureAuthSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_data_sources (
    provider TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    encrypted_config TEXT,
    last_test_status TEXT,
    last_tested_at INTEGER,
    last_error TEXT,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at INTEGER NOT NULL
  );`);
  const now=Math.floor(Date.now()/1000);
  for(const provider of Object.keys(dataSourceDefinitions)) db.prepare("INSERT OR IGNORE INTO platform_data_sources (provider,enabled,updated_at) VALUES (?,0,?)").bind(provider,now).run();
}

async function decodedConfig(provider:DataSourceProvider,ciphertext:string|null):Promise<Record<string,string>> {
  if(!ciphertext)return {};
  try{return await decryptDataSourceConfig(ciphertext);}catch{return {};}
}

export async function listDataSources():Promise<StoredDataSource[]> {
  await ensureDataSourceSchema(); const db=getDatabase();
  const rows=db.prepare("SELECT provider,enabled,encrypted_config AS encryptedConfig,last_test_status AS lastTestStatus,last_tested_at AS lastTestedAt,last_error AS lastError,updated_at AS updatedAt FROM platform_data_sources ORDER BY provider").all<{provider:string;enabled:number;encryptedConfig:string|null;lastTestStatus:string|null;lastTestedAt:number|null;lastError:string|null;updatedAt:number}>().results;
  const output:StoredDataSource[]=[];
  for(const row of rows){if(!(row.provider in dataSourceDefinitions))continue;const provider=row.provider as DataSourceProvider;const config=await decodedConfig(provider,row.encryptedConfig);const definition=dataSourceDefinitions[provider];const configuredFields=definition.fields.filter(field=>Boolean(config[field.key])).length;output.push({provider,enabled:Boolean(row.enabled),configured:definition.fields.every(field=>!field.required||Boolean(config[field.key])),configuredFields,totalFields:definition.fields.length,lastTestStatus:row.lastTestStatus,lastTestedAt:row.lastTestedAt,lastError:row.lastError,updatedAt:row.updatedAt});}
  return output;
}

export async function saveDataSource(provider:DataSourceProvider,values:Record<string,string>,enabled:boolean,adminId:string):Promise<void> {
  await ensureDataSourceSchema(); const db=getDatabase();const definition=dataSourceDefinitions[provider];
  const row=db.prepare("SELECT encrypted_config AS encryptedConfig FROM platform_data_sources WHERE provider=?").bind(provider).first<{encryptedConfig:string|null}>();
  const previous=await decodedConfig(provider,row?.encryptedConfig||null);const allowed=new Set(definition.fields.map(field=>field.key));
  for(const [key,value] of Object.entries(values))if(allowed.has(key)&&value.trim())previous[key]=value.trim();
  const configured=definition.fields.every(field=>!field.required||Boolean(previous[field.key]));
  if(enabled&&!configured)throw new Error("DATA_SOURCE_REQUIRED_FIELDS_MISSING");
  const encrypted=Object.keys(previous).length?await encryptDataSourceConfig(previous):null;const now=Math.floor(Date.now()/1000);
  db.prepare("UPDATE platform_data_sources SET enabled=?,encrypted_config=?,last_test_status=?,last_error=NULL,updated_by=?,updated_at=? WHERE provider=?").bind(enabled?1:0,encrypted,configured?"configured":null,adminId,now,provider).run();
}

export async function clearDataSource(provider:DataSourceProvider,adminId:string):Promise<void> {
  await ensureDataSourceSchema();getDatabase().prepare("UPDATE platform_data_sources SET enabled=0,encrypted_config=NULL,last_test_status=NULL,last_tested_at=NULL,last_error=NULL,updated_by=?,updated_at=? WHERE provider=?").bind(adminId,Math.floor(Date.now()/1000),provider).run();
}

export async function getEnabledDataSourceConfig(provider:DataSourceProvider):Promise<Record<string,string>|null> {
  await ensureDataSourceSchema();const row=getDatabase().prepare("SELECT enabled,encrypted_config AS encryptedConfig FROM platform_data_sources WHERE provider=?").bind(provider).first<{enabled:number;encryptedConfig:string|null}>();
  if(!row?.enabled||!row.encryptedConfig)return null;return decodedConfig(provider,row.encryptedConfig);
}
