import { SqliteExecutionRepository } from "../platform/adapters/sqlite/execution-repository";
import { getDatabase } from "./auth";
import { ensureProductSchema } from "./product";

let repository:SqliteExecutionRepository|undefined;
export function executionRepository(){return repository??=new SqliteExecutionRepository(getDatabase());}
export async function ensureExecutionSchema(){await ensureProductSchema();executionRepository().ensureSchema();}
