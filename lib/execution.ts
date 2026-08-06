import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import { SqliteExecutionProjectGate } from "../platform/adapters/sqlite/execution-project-gate";
import { AtomicTaskCreationService } from "../platform/modules/execution/task-creation";
import { AtomicTaskSettlementService } from "../platform/modules/execution/task-settlement";
import { ExecutionWorkerSupervisor, type WorkerHandlers, type WorkerSupervisorDependencies, type WorkerSupervisorOptions } from "../platform/modules/execution/worker";
import { getDatabase } from "./auth";
import { commerceService, ensureBillingSchema } from "./billing";
import { ensureProductSchema } from "./product";

let repository:SqliteExecutionRepository|undefined;
let creationService:AtomicTaskCreationService|undefined;
let settlementService:AtomicTaskSettlementService|undefined;
export function executionRepository(){return repository??=new SqliteExecutionRepository(getDatabase());}
export async function ensureExecutionSchema(){await ensureProductSchema();executionRepository().ensureSchema();}
export async function atomicTaskCreationService(){await ensureBillingSchema();await ensureExecutionSchema();return creationService??=new AtomicTaskCreationService(executionRepository(),commerceService(),new SqliteExecutionProjectGate(getDatabase()));}
export async function atomicTaskSettlementService(){await ensureBillingSchema();await ensureExecutionSchema();return settlementService??=new AtomicTaskSettlementService(executionRepository(),commerceService());}
export async function executionWorkerSupervisor(handlers:WorkerHandlers,options:WorkerSupervisorOptions,dependencies:WorkerSupervisorDependencies={}){await ensureExecutionSchema();return new ExecutionWorkerSupervisor(executionRepository(),handlers,options,dependencies);}
