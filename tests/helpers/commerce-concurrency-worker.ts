import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { AppDatabase } from "../../lib/database";
import { SqliteCommerceRepository } from "../../platform/adapters/sqlite/commerce-repository";
import { CommerceError, CommercialEntitlementService } from "../../platform/modules/commerce/service";
import type { CommercialSubject } from "../../platform/modules/commerce";

type Input={databasePath:string;gate:SharedArrayBuffer;subject:CommercialSubject;operation:{type:"reserve"|"commit"|"release"|"adjust"|"usage"|"project";quantity?:number;key?:string;taskId?:string;reservationId?:string;entryType?:"refund"|"adjustment"|"expiry";relatedEntryId?:string|null;projectId?:string;limit?:number}};
const input=workerData as Input,sqlite=new DatabaseSync(input.databasePath);sqlite.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
const database=new AppDatabase(sqlite),repository=new SqliteCommerceRepository(database),service=new CommercialEntitlementService(repository,()=>1_786_000_000);
parentPort?.postMessage({ready:true});const gate=new Int32Array(input.gate);Atomics.wait(gate,0,0);
try{
 const operation=input.operation;let result:unknown;
 if(operation.type==="reserve")result=service.reserveCredits(input.subject,{quantity:operation.quantity!,idempotencyKey:operation.key!,taskId:operation.taskId!,correlationId:"concurrent-test"});
 else if(operation.type==="commit"||operation.type==="release")result=service[operation.type==="commit"?"commitCredits":"releaseCredits"](input.subject,{reservationId:operation.reservationId!,idempotencyKey:operation.key!,correlationId:"concurrent-test"});
 else if(operation.type==="adjust")result=service.adjustCredits(input.subject,{entryType:operation.entryType!,amount:operation.quantity!,idempotencyKey:operation.key!,correlationId:"concurrent-test",relatedEntryId:operation.relatedEntryId??null});
 else if(operation.type==="usage")result=service.ingestUsage(input.subject,{metric:"pages_crawled",quantity:operation.quantity!,state:"pending",idempotencyKey:operation.key!,taskId:operation.taskId!});
 else result=database.transaction(()=>{const count=database.prepare("SELECT COUNT(*) AS count FROM projects WHERE organization_id=? AND status!='pending_deletion'").bind(input.subject.organizationId).first<{count:number}>()?.count??0;if(count>=operation.limit!)throw new CommerceError("LIMIT_REACHED","project limit",403);database.prepare("INSERT INTO projects(id,organization_id,status) VALUES (?,?,'active')").bind(operation.projectId!,input.subject.organizationId).run();return{projectId:operation.projectId};});
 parentPort?.postMessage({ok:true,result});
}catch(error){parentPort?.postMessage({ok:false,code:error instanceof CommerceError?error.code:"UNKNOWN",message:error instanceof Error?error.message:String(error)});}
finally{sqlite.close();}
