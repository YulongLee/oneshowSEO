import { createHash } from "node:crypto";
import type { PlanEntitlements } from "../commerce/catalog";
import type { CommercialSubject, CreditLedgerEntry, EffectiveEntitlements } from "../commerce";
import { authorizeOrganization, type OrganizationRoleKey, type Permission } from "../identity/authorization";
import type { ExecutionProjectGate } from "../projects";
import type { ExecutionIdempotencyRecord, ExecutionJob, ExecutionRepository, ExecutionTask, OutboxMessage } from "./index";

export class TaskCreationError extends Error{constructor(public readonly code:string,message:string,public readonly status=400){super(message);}}
export type EntitlementRequirement={key:keyof PlanEntitlements;quantity:number;currentUsage:number};
export type AtomicTaskCreationInput={
  activeOrganizationId:string;organizationId:string;projectId:string;requestedByAccountId:string;role:OrganizationRoleKey;permission:Permission;subject:CommercialSubject;
  triggerType:ExecutionTask["triggerType"];taskType:string;capability:string;input:Record<string,unknown>;locale:ExecutionTask["locale"];idempotencyKey:string;correlationId:string;
  entitlements:EntitlementRequirement[];creditCost:number;queue:string;jobType:string;priority:number;availableAt?:number;maxAttempts:number;timeoutSeconds:number;
};
export type AtomicTaskCreationResult={task:ExecutionTask;job:ExecutionJob;reservationId:string|null;outbox:OutboxMessage;duplicate:boolean};

export interface TaskCommerceGate{
  authorizeAccess(subject:CommercialSubject):EffectiveEntitlements;
  authorize(subject:CommercialSubject,key:keyof PlanEntitlements,quantity?:number,currentUsage?:number):EffectiveEntitlements;
  reserveCredits(subject:CommercialSubject,input:{quantity:number;idempotencyKey:string;taskId:string;projectId?:string|null;correlationId:string}):CreditLedgerEntry;
}

function normalized(value:unknown,path="input"):unknown{
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map((item,index)=>normalized(item,`${path}[${index}]`));
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(key=>{if(/password|secret|token|credential|api[_-]?key/i.test(key))throw new TaskCreationError("SENSITIVE_INPUT_REJECTED",`任务输入不能包含敏感字段：${path}.${key}`);return[key,normalized((value as Record<string,unknown>)[key],`${path}.${key}`)];}));
  throw new TaskCreationError("INVALID_TASK_INPUT",`任务输入包含不支持的值：${path}`);
}
function requestPayload(input:AtomicTaskCreationInput){return{organizationId:input.organizationId,projectId:input.projectId,triggerType:input.triggerType,taskType:input.taskType,capability:input.capability,input:normalized(input.input),locale:input.locale,entitlements:[...input.entitlements].sort((left,right)=>String(left.key).localeCompare(String(right.key))),creditCost:input.creditCost,queue:input.queue,jobType:input.jobType,priority:input.priority,availableAt:input.availableAt??null,maxAttempts:input.maxAttempts,timeoutSeconds:input.timeoutSeconds};}
function validate(input:AtomicTaskCreationInput){
  for(const value of [input.taskType,input.capability,input.queue,input.jobType,input.idempotencyKey,input.correlationId])if(!value.trim())throw new TaskCreationError("INVALID_TASK_REQUEST","任务创建参数不完整");
  if(!Number.isInteger(input.creditCost)||input.creditCost<0)throw new TaskCreationError("INVALID_CREDIT_COST","Credits 预留数量无效");
  if(!Number.isInteger(input.priority)||input.priority<0||input.priority>100||!Number.isInteger(input.maxAttempts)||input.maxAttempts<1||input.maxAttempts>100||!Number.isInteger(input.timeoutSeconds)||input.timeoutSeconds<1||input.timeoutSeconds>86400)throw new TaskCreationError("INVALID_JOB_POLICY","作业执行策略无效");
  for(const entitlement of input.entitlements)if(!Number.isInteger(entitlement.quantity)||entitlement.quantity<0||!Number.isInteger(entitlement.currentUsage)||entitlement.currentUsage<0)throw new TaskCreationError("INVALID_ENTITLEMENT_USAGE","权益用量参数无效");
  const payload=requestPayload(input),json=JSON.stringify(payload);if(Buffer.byteLength(json)>65536)throw new TaskCreationError("TASK_INPUT_TOO_LARGE","任务输入不能超过 64KB",413);return{payload,hash:createHash("sha256").update(json).digest("hex")};
}

export class AtomicTaskCreationService{
  constructor(private readonly repository:ExecutionRepository,private readonly commerce:TaskCommerceGate,private readonly projects:ExecutionProjectGate,private readonly now:()=>number=()=>Math.floor(Date.now()/1000)){this.repository.ensureSchema();}
  create(input:AtomicTaskCreationInput):AtomicTaskCreationResult{
    const{payload,hash}=validate(input),scope="task.create",now=this.now();
    return this.repository.transaction(()=>{
      authorizeOrganization({role:input.role,permission:input.permission,activeOrganizationId:input.activeOrganizationId,resourceOrganizationId:input.organizationId});
      const existing=this.repository.idempotency(input.organizationId,scope,input.idempotencyKey);if(existing)return this.existing(input,existing,hash);
      this.projects.assertActive(input.organizationId,input.projectId);this.commerce.authorizeAccess(input.subject);for(const requirement of input.entitlements)this.commerce.authorize(input.subject,requirement.key,requirement.quantity,requirement.currentUsage);
      const taskId=crypto.randomUUID(),jobId=crypto.randomUUID(),outboxId=crypto.randomUUID();
      const reservation=input.creditCost?this.commerce.reserveCredits(input.subject,{quantity:input.creditCost,idempotencyKey:`task:${input.idempotencyKey}`,taskId,projectId:input.projectId,correlationId:input.correlationId}):null;
      const task:ExecutionTask={id:taskId,organizationId:input.organizationId,projectId:input.projectId,requestedByAccountId:input.requestedByAccountId,triggerType:input.triggerType,taskType:input.taskType,capability:input.capability,state:"queued",progress:0,cancellable:true,input:payload.input as Record<string,unknown>,locale:input.locale,idempotencyKey:input.idempotencyKey,correlationId:input.correlationId,version:1,createdAt:now,updatedAt:now,startedAt:null,completedAt:null};
      const job:ExecutionJob={id:jobId,organizationId:input.organizationId,projectId:input.projectId,taskId,queue:input.queue,jobType:input.jobType,state:"queued",priority:input.priority,availableAt:input.availableAt??now,maxAttempts:input.maxAttempts,timeoutSeconds:input.timeoutSeconds,attemptCount:0,idempotencyKey:`task:${input.idempotencyKey}`,correlationId:input.correlationId,createdAt:now,updatedAt:now,completedAt:null};
      const outbox:OutboxMessage={id:outboxId,organizationId:input.organizationId,projectId:input.projectId,aggregateType:"task",aggregateId:taskId,eventType:"execution.task.created",payload:{taskId,jobId,capability:input.capability,reservationId:reservation?.id??null},state:"pending",attempts:0,availableAt:now,publishedAt:null,lastError:null,idempotencyKey:`task-created:${input.idempotencyKey}`,correlationId:input.correlationId,createdAt:now};
      this.repository.createTask(task);this.repository.createJob(job);this.repository.appendOutbox(outbox);
      this.repository.appendAudit({id:crypto.randomUUID(),organizationId:input.organizationId,projectId:input.projectId,actorType:input.triggerType==="api"?"api":input.triggerType==="mcp"?"mcp":input.triggerType==="agent"?"agent":"user",actorId:input.requestedByAccountId,action:"execution.task.create",targetType:"task",targetId:taskId,outcome:"pending",reason:null,policyVersion:"execution-task-create-v1",correlationId:input.correlationId,metadata:{capability:input.capability,jobId,reservationId:reservation?.id??null},occurredAt:now});
      this.repository.putIdempotency({id:crypto.randomUUID(),organizationId:input.organizationId,scope,idempotencyKey:input.idempotencyKey,requestHash:hash,resourceType:"task",resourceId:taskId,responseStatus:202,response:{taskId,jobId,outboxId,reservationId:reservation?.id??null},expiresAt:null,createdAt:now,updatedAt:now});
      return{task,job,reservationId:reservation?.id??null,outbox,duplicate:false};
    });
  }
  private existing(input:AtomicTaskCreationInput,record:ExecutionIdempotencyRecord,hash:string):AtomicTaskCreationResult{
    if(record.requestHash!==hash)throw new TaskCreationError("IDEMPOTENCY_CONFLICT","幂等键已用于不同的任务请求",409);
    const taskId=String(record.response?.taskId??""),jobId=String(record.response?.jobId??""),outboxId=String(record.response?.outboxId??"");const task=this.repository.task(input.organizationId,taskId),job=this.repository.job(input.organizationId,jobId);
    const outbox=this.repository.outbox(input.organizationId,outboxId);if(!task||!job||!outbox)throw new TaskCreationError("IDEMPOTENCY_RECORD_INCOMPLETE","任务幂等记录不完整",500);
    return{task,job,reservationId:record.response?.reservationId?String(record.response.reservationId):null,outbox,duplicate:true};
  }
}
