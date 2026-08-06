import type { ExecutionWorkerSupervisor } from "../modules/execution/worker";

export interface WorkerProcessSignals{once(event:"SIGINT"|"SIGTERM",listener:()=>void):unknown;off(event:"SIGINT"|"SIGTERM",listener:()=>void):unknown;}

export function runSupervisedWorker(supervisor:ExecutionWorkerSupervisor,signals:WorkerProcessSignals=process):{stopped:Promise<void>;stop:()=>Promise<void>}{
  let stopping:Promise<void>|null=null,resolveStopped:()=>void=()=>{};const stopped=new Promise<void>(resolve=>{resolveStopped=resolve;});
  const shutdown=()=>{if(stopping)return stopping;stopping=supervisor.stop().finally(()=>{signals.off("SIGINT",shutdown);signals.off("SIGTERM",shutdown);resolveStopped();});return stopping;};
  signals.once("SIGINT",shutdown);signals.once("SIGTERM",shutdown);supervisor.start();return{stopped,stop:shutdown};
}
