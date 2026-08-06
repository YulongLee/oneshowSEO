import { SqliteWorkspaceCatalogRepository } from "../platform/adapters/sqlite/workspace-catalog-repository";
import { WorkspaceCatalogService } from "../platform/modules/execution/workspace-catalog";
import { getDatabase } from "./auth";
import { ensureExecutionSchema } from "./execution";

let service:WorkspaceCatalogService|undefined;
export async function workspaceCatalog(){await ensureExecutionSchema();return service??=new WorkspaceCatalogService(new SqliteWorkspaceCatalogRepository(getDatabase()));}
