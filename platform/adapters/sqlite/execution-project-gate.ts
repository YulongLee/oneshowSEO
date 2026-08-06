import type { AppDatabase } from "../../../lib/database";
import type { ExecutionProjectGate } from "../../modules/projects";

export class SqliteExecutionProjectGate implements ExecutionProjectGate{
  constructor(private readonly database:AppDatabase){}
  assertActive(organizationId:string,projectId:string){const project=this.database.prepare("SELECT status FROM projects WHERE organization_id=? AND id=?").bind(organizationId,projectId).first<{status:string}>();if(!project)throw new Error("PROJECT_NOT_FOUND");if(project.status!=="active")throw new Error("PROJECT_NOT_ACTIVE");}
}
