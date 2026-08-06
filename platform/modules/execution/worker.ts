import { createHash, randomBytes } from "node:crypto";
import type { ExecutionJob, ExecutionTask, ExecutionWorkerRepository, WorkerClaim, WorkerFailureState, WorkerMaintenance } from "./index";

export class WorkerJobError extends Error{constructor(public readonly code:string,message:string,public readonly retryable=true){super(message);}}
export class WorkerCancellationError extends Error{constructor(message="Job cancellation requested"){super(message);}}
export class WorkerLeaseLostError extends Error{constructor(){super("Worker lease is no longer valid");}}
export class WorkerShutdownError extends Error{constructor(){super("Worker is shutting down");}}

export type WorkerAuthorizationContext={task:ExecutionTask;job:ExecutionJob;attemptId:string};
export type WorkerHandlerContext={task:ExecutionTask;job:ExecutionJob;attemptId:string;signal:AbortSignal;heartbeat:()=>boolean};
export type WorkerHandler={authorize:(context:WorkerAuthorizationContext)=>Promise<void>|void;execute:(input:Record<string,unknown>,context:WorkerHandlerContext)=>Promise<void>};
export type WorkerHandlers=Readonly<Record<string,WorkerHandler>>;
export type WorkerSupervisorOptions={workerId:string;queue:string;concurrency:number;pollIntervalMs:number;leaseSeconds:number;heartbeatIntervalMs:number;shutdownGraceMs:number;maintenanceLimit:number;baseBackoffSeconds:number;maxBackoffSeconds:number};
export type WorkerSupervisorDependencies={now?:()=>number;randomToken?:()=>string;onError?:(error:unknown)=>void};

type ActiveExecution={controller:AbortController;promise:Promise<void>};
const seconds=()=>Math.floor(Date.now()/1000);
const hash=(token:string)=>createHash("sha256").update(token).digest("hex");
const wait=(milliseconds:number,signal?:AbortSignal)=>new Promise<void>(resolve=>{if(signal?.aborted)return resolve();const timer=setTimeout(done,milliseconds);function done(){signal?.removeEventListener("abort",done);clearTimeout(timer);resolve();}signal?.addEventListener("abort",done,{once:true});});
function safeError(error:unknown){const source=error instanceof Error?error.message:String(error),redacted=source.replace(/bearer\s+\S+|(["']?(?:password|secret|token|credential|api[_-]?key)["']?\s*[:=]\s*)\S+/gi,"$1[REDACTED]");return redacted.slice(0,512)||"Worker execution failed";}
function validate(options:WorkerSupervisorOptions,handlers:WorkerHandlers){
  if(!options.workerId.trim()||options.workerId.length>128||!options.queue.trim()||options.queue.length>128)throw new Error("WORKER_IDENTITY_INVALID");
  if(!Number.isInteger(options.concurrency)||options.concurrency<1||options.concurrency>32)throw new Error("WORKER_CONCURRENCY_INVALID");
  if(!Number.isInteger(options.pollIntervalMs)||options.pollIntervalMs<10||options.pollIntervalMs>60000)throw new Error("WORKER_POLL_INTERVAL_INVALID");
  if(!Number.isInteger(options.leaseSeconds)||options.leaseSeconds<5||options.leaseSeconds>3600||!Number.isInteger(options.heartbeatIntervalMs)||options.heartbeatIntervalMs<100||options.heartbeatIntervalMs>=options.leaseSeconds*1000)throw new Error("WORKER_LEASE_POLICY_INVALID");
  if(!Number.isInteger(options.shutdownGraceMs)||options.shutdownGraceMs<0||options.shutdownGraceMs>300000||!Number.isInteger(options.maintenanceLimit)||options.maintenanceLimit<1||options.maintenanceLimit>500)throw new Error("WORKER_SUPERVISION_POLICY_INVALID");
  if(!Number.isInteger(options.baseBackoffSeconds)||options.baseBackoffSeconds<1||!Number.isInteger(options.maxBackoffSeconds)||options.maxBackoffSeconds<options.baseBackoffSeconds||options.maxBackoffSeconds>86400)throw new Error("WORKER_BACKOFF_POLICY_INVALID");
  for(const jobType of Object.keys(handlers))if(!jobType.trim()||jobType.length>128)throw new Error("WORKER_JOB_TYPE_INVALID");
}

export class ExecutionWorkerSupervisor{
  private running=false;
  private pollAbort:AbortController|null=null;
  private loopPromise:Promise<void>|null=null;
  private readonly active=new Map<string,ActiveExecution>();
  private readonly now:()=>number;
  private readonly randomToken:()=>string;
  private readonly onError:(error:unknown)=>void;
  private readonly jobTypes:string[];
  constructor(private readonly repository:ExecutionWorkerRepository,private readonly handlers:WorkerHandlers,private readonly options:WorkerSupervisorOptions,dependencies:WorkerSupervisorDependencies={}){validate(options,handlers);this.jobTypes=Object.keys(handlers).sort();this.now=dependencies.now??seconds;this.randomToken=dependencies.randomToken??(()=>randomBytes(32).toString("hex"));this.onError=dependencies.onError??(()=>{});}

  maintenance():WorkerMaintenance{return this.repository.maintainJobs({queue:this.options.queue,jobTypes:this.jobTypes,workerId:this.options.workerId,now:this.now(),limit:this.options.maintenanceLimit,baseBackoffSeconds:this.options.baseBackoffSeconds,maxBackoffSeconds:this.options.maxBackoffSeconds});}
  async runOne():Promise<boolean>{this.maintenance();const active=this.dispatch();if(!active)return false;await active.promise;return true;}
  start(){if(this.loopPromise)return;this.running=true;this.pollAbort=new AbortController();this.loopPromise=this.loop().finally(()=>{this.running=false;this.loopPromise=null;});}
  async stop(){this.running=false;this.pollAbort?.abort();const loop=this.loopPromise;if(loop)await loop;const pending=()=>Promise.allSettled([...this.active.values()].map(value=>value.promise));if(!this.active.size)return;let drained=false;await Promise.race([pending().then(()=>{drained=true;}),wait(this.options.shutdownGraceMs)]);if(drained)return;for(const execution of this.active.values())execution.controller.abort(new WorkerShutdownError());await Promise.race([pending(),wait(50)]);}
  get activeCount(){return this.active.size;}

  private async loop(){while(this.running){try{this.maintenance();let dispatched=false;while(this.running&&this.active.size<this.options.concurrency){const execution=this.dispatch();if(!execution)break;dispatched=true;}if(this.running&&(!dispatched||this.active.size>=this.options.concurrency))await wait(this.options.pollIntervalMs,this.pollAbort?.signal);}catch(error){this.onError(error);if(this.running)await wait(this.options.pollIntervalMs,this.pollAbort?.signal);}}}
  private dispatch():ActiveExecution|null{if(!this.jobTypes.length)return null;const token=this.randomToken(),tokenHash=hash(token),claim=this.repository.claimJob({queue:this.options.queue,jobTypes:this.jobTypes,workerId:this.options.workerId,tokenHash,now:this.now(),leaseSeconds:this.options.leaseSeconds});if(!claim)return null;const controller=new AbortController();const execution:ActiveExecution={controller,promise:Promise.resolve()};execution.promise=this.execute(claim,tokenHash,controller).catch(this.onError).finally(()=>this.active.delete(claim.job.id));this.active.set(claim.job.id,execution);return execution;}
  private heartbeat(claim:WorkerClaim,tokenHash:string,controller:AbortController){try{const result=this.repository.heartbeatLease({organizationId:claim.job.organizationId,jobId:claim.job.id,attemptId:claim.attempt.id,workerId:this.options.workerId,tokenHash,now:this.now(),leaseSeconds:this.options.leaseSeconds});if(!result){controller.abort(new WorkerLeaseLostError());return false;}if(result.cancellationRequested){controller.abort(new WorkerCancellationError());return false;}return true;}catch(error){this.onError(error);controller.abort(new WorkerLeaseLostError());return false;}}
  private async execute(claim:WorkerClaim,tokenHash:string,controller:AbortController){const handler=this.handlers[claim.job.jobType];if(!handler)throw new Error("WORKER_HANDLER_NOT_FOUND");const heartbeatTimer=setInterval(()=>this.heartbeat(claim,tokenHash,controller),this.options.heartbeatIntervalMs),timeoutTimer=setTimeout(()=>controller.abort(new WorkerJobError("JOB_TIMEOUT","Job execution timed out",true)),claim.job.timeoutSeconds*1000),clear=()=>{clearInterval(heartbeatTimer);clearTimeout(timeoutTimer);};controller.signal.addEventListener("abort",clear,{once:true});
    try{try{await handler.authorize({task:claim.task,job:claim.job,attemptId:claim.attempt.id});}catch(error){throw new WorkerJobError("EXECUTION_NOT_AUTHORIZED",safeError(error),false);}await handler.execute(claim.task.input,{task:claim.task,job:claim.job,attemptId:claim.attempt.id,signal:controller.signal,heartbeat:()=>this.heartbeat(claim,tokenHash,controller)});if(controller.signal.aborted)throw controller.signal.reason;if(!this.heartbeat(claim,tokenHash,controller))throw controller.signal.reason;this.repository.succeedAttempt({claim,workerId:this.options.workerId,tokenHash,now:this.now()});}
    catch(error){const reason=controller.signal.aborted?controller.signal.reason:error;if(reason instanceof WorkerShutdownError||reason instanceof WorkerLeaseLostError)return;if(reason instanceof WorkerCancellationError){this.repository.cancelAttempt({claim,workerId:this.options.workerId,tokenHash,now:this.now(),reason:safeError(reason)});return;}const normalized=reason instanceof WorkerJobError?reason:new WorkerJobError("WORKER_UNEXPECTED_ERROR",safeError(reason),true),canRetry=normalized.retryable&&claim.attempt.attemptNumber<claim.job.maxAttempts,state:WorkerFailureState=canRetry?"retrying":normalized.retryable?"quarantined":"failed",retryAt=canRetry?this.now()+this.backoff(claim.attempt.attemptNumber):null;this.repository.failAttempt({claim,workerId:this.options.workerId,tokenHash,now:this.now(),state,retryAt,errorCode:normalized.code.slice(0,128),errorMessage:safeError(normalized)});}
    finally{clear();controller.signal.removeEventListener("abort",clear);}
  }
  private backoff(attempt:number){return Math.min(this.options.maxBackoffSeconds,this.options.baseBackoffSeconds*2**Math.max(0,attempt-1));}
}
