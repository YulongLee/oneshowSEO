import {
  createProductionWorker,
  startWorkerHeartbeat,
} from "../lib/production-worker";
import { runSupervisedWorker } from "../platform/workers/supervisor-runtime";
import { advanceAutopilotRuns } from "../lib/autopilot";

if (process.env.WORKER_RUNTIME_ENABLED !== "true")
  throw new Error("WORKER_RUNTIME_DISABLED");
const workerId = (
    process.env.WORKER_ID ||
    `${process.env.HOSTNAME || "worker"}:${process.pid}`
  ).slice(0, 128),
  supervisor = await createProductionWorker(),
  stopHeartbeat = startWorkerHeartbeat(workerId);
await advanceAutopilotRuns();
const orchestrationTimer = setInterval(
    () =>
      void advanceAutopilotRuns().catch((error) =>
        console.error(
          "Autopilot orchestration error",
          error instanceof Error ? error.message : String(error),
        ),
      ),
    15_000,
  ),
  runtime = runSupervisedWorker(supervisor);
try {
  await runtime.stopped;
} finally {
  clearInterval(orchestrationTimer);
  stopHeartbeat();
}
