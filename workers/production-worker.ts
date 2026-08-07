import { createProductionWorker, startWorkerHeartbeat } from "../lib/production-worker";
import { runSupervisedWorker } from "../platform/workers/supervisor-runtime";

if(process.env.WORKER_RUNTIME_ENABLED!=="true")throw new Error("WORKER_RUNTIME_DISABLED");
const workerId=(process.env.WORKER_ID||`${process.env.HOSTNAME||"worker"}:${process.pid}`).slice(0,128),supervisor=await createProductionWorker(),stopHeartbeat=startWorkerHeartbeat(workerId),runtime=runSupervisedWorker(supervisor);
try{await runtime.stopped;}finally{stopHeartbeat();}
