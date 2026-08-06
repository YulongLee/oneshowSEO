import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import { SqliteExecutionProjectGate } from "../platform/adapters/sqlite/execution-project-gate";
import { LocalObjectStorageProvider } from "../platform/adapters/object-storage/local-object-storage";
import { AtomicTaskCreationService } from "../platform/modules/execution/task-creation";
import { AtomicTaskSettlementService } from "../platform/modules/execution/task-settlement";
import { ExecutionWorkerSupervisor, type WorkerHandlers, type WorkerSupervisorDependencies, type WorkerSupervisorOptions } from "../platform/modules/execution/worker";
import { ArtifactObjectService, SignatureArtifactScanner } from "../platform/modules/execution/object-storage";
import { getDatabase } from "./auth";
import { commerceService, ensureBillingSchema } from "./billing";
import { ensureProductSchema } from "./product";

let repository:SqliteExecutionRepository|undefined;
let creationService:AtomicTaskCreationService|undefined;
let settlementService:AtomicTaskSettlementService|undefined;
let objectService:ArtifactObjectService|undefined;
export function executionRepository(){return repository??=new SqliteExecutionRepository(getDatabase());}
export async function ensureExecutionSchema(){await ensureProductSchema();executionRepository().ensureSchema();}
export async function atomicTaskCreationService(){await ensureBillingSchema();await ensureExecutionSchema();return creationService??=new AtomicTaskCreationService(executionRepository(),commerceService(),new SqliteExecutionProjectGate(getDatabase()));}
export async function atomicTaskSettlementService(){await ensureBillingSchema();await ensureExecutionSchema();return settlementService??=new AtomicTaskSettlementService(executionRepository(),commerceService());}
export async function artifactObjectService(){await ensureExecutionSchema();const root=process.env.OBJECT_STORAGE_ROOT,secret=process.env.OBJECT_STORAGE_SIGNING_SECRET;if(!root||!secret)throw new Error("OBJECT_STORAGE_NOT_CONFIGURED");return objectService??=new ArtifactObjectService(new LocalObjectStorageProvider(root),executionRepository(),new SignatureArtifactScanner(),secret);}
export async function executionWorkerSupervisor(handlers:WorkerHandlers,options:WorkerSupervisorOptions,dependencies:WorkerSupervisorDependencies={}){await ensureExecutionSchema();return new ExecutionWorkerSupervisor(executionRepository(),handlers,options,dependencies);}
