import type { AppDatabase } from "./database";
import { SafeHttpError } from "../platform/modules/integrations/safe-http";
import type { SafeHttpRequest } from "../platform/modules/integrations/safe-http";
import type { ProviderHttpClient } from "../platform/modules/integrations/launch-adapters";

type Post={id?:number;link?:string;status?:string;title?:{raw?:string;rendered?:string};content?:{raw?:string};excerpt?:{raw?:string}};
export async function verifiedWordpressPublication(db:AppDatabase,input:{key:string;base:string;title:string;slug:string;excerpt:string;html:string;correlationId:string;signal?:AbortSignal},request:(input:SafeHttpRequest)=>ReturnType<ProviderHttpClient['request']>) {
 db.exec(`CREATE TABLE IF NOT EXISTS wordpress_publish_receipts(publication_key TEXT PRIMARY KEY,slug TEXT NOT NULL,state TEXT NOT NULL,external_id TEXT,updated_at INTEGER NOT NULL);`);
 if(!input.slug)throw new Error("PUBLISH_STABLE_SLUG_REQUIRED");
 const parse=(body:Uint8Array)=>JSON.parse(new TextDecoder().decode(body));
 const verify=(post:Post)=>Boolean(post.id&&post.status==='publish'&&String(post.title?.raw??post.title?.rendered??'').trim()===input.title.trim()&&String(post.content?.raw??'').trim()===input.html.trim());
 const query=await request({url:`${input.base}/wp-json/wp/v2/posts?context=edit&slug=${encodeURIComponent(input.slug)}&per_page=1`,method:'GET',correlationId:input.correlationId});
 const list=parse(query.body),existing=Array.isArray(list)?list[0] as Post|undefined:undefined;
 if(existing?.id){
   if(!verify(existing))throw new Error("PUBLISH_TARGET_EXISTS_OR_CONTENT_MISMATCH");
   db.prepare("INSERT INTO wordpress_publish_receipts VALUES(?,?,'confirmed',?,?) ON CONFLICT(publication_key) DO UPDATE SET state='confirmed',external_id=excluded.external_id,updated_at=excluded.updated_at").bind(input.key,input.slug,String(existing.id),Math.floor(Date.now()/1000)).run();
   return{externalId:String(existing.id),url:String(existing.link||`${input.base}/?p=${existing.id}`),status:'publish',verified:true,attempts:query.attempts};
 }
 if(input.signal?.aborted)throw input.signal.reason;
 const acquired=db.transaction(()=>{
   if(db.prepare("SELECT publication_key FROM wordpress_publish_receipts WHERE publication_key=?").bind(input.key).first())return false;
   db.prepare("INSERT INTO wordpress_publish_receipts VALUES(?,?,'sending',NULL,?)").bind(input.key,input.slug,Math.floor(Date.now()/1000)).run();return true;
 });
 if(!acquired)throw new Error("PUBLISH_CONFIRMATION_PENDING");
 // A transport timeout is ambiguous: subsequent attempts only reconcile the stable slug.
 const created=await request({url:`${input.base}/wp-json/wp/v2/posts`,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:input.title,content:input.html,excerpt:input.excerpt,status:'publish',slug:input.slug}),idempotent:false,correlationId:input.correlationId}).catch(error=>{
   // A definite 4xx rejection did not create a post; allow a corrected request.
   if(error instanceof SafeHttpError&&error.normalized.code==='PROVIDER_REJECTED'&&!error.normalized.retryable)db.prepare("DELETE FROM wordpress_publish_receipts WHERE publication_key=? AND state='sending' AND external_id IS NULL").bind(input.key).run();
   throw error;
 }),post=parse(created.body) as Post;
 if(!post.id)throw new Error("PUBLISH_PROVIDER_RESPONSE_INVALID");
 db.prepare("UPDATE wordpress_publish_receipts SET external_id=?,updated_at=? WHERE publication_key=?").bind(String(post.id),Math.floor(Date.now()/1000),input.key).run();
 const result=await request({url:`${input.base}/wp-json/wp/v2/posts/${post.id}?context=edit`,method:'GET',correlationId:input.correlationId}),verified=parse(result.body) as Post;
 if(verified.id!==post.id||!verify(verified))throw new Error("PUBLISH_VERIFICATION_FAILED");
 db.prepare("UPDATE wordpress_publish_receipts SET state='confirmed',updated_at=? WHERE publication_key=?").bind(Math.floor(Date.now()/1000),input.key).run();
 return{externalId:String(post.id),url:String(verified.link||post.link||`${input.base}/?p=${post.id}`),status:'publish',verified:true,attempts:created.attempts+result.attempts};
}
