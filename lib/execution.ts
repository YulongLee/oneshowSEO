import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import { SqliteExecutionProjectGate } from "../platform/adapters/sqlite/execution-project-gate";
import { AtomicTaskCreationService } from "../platform/modules/execution/task-creation";
import { getDatabase } from "./auth";
import { commerceService, ensureBillingSchema } from "./billing";
import { ensureProductSchema } from "./product";

let repository:SqliteExecutionRepository|undefined;
let creationService:AtomicTaskCreationService|undefined;
export function executionRepository(){return repository??=new SqliteExecutionRepository(getDatabase());}
export async function ensureExecutionSchema(){await ensureProductSchema();executionRepository().ensureSchema();}
export async function atomicTaskCreationService(){await ensureBillingSchema();await ensureExecutionSchema();return creationService??=new AtomicTaskCreationService(executionRepository(),commerceService(),new SqliteExecutionProjectGate(getDatabase()));}
