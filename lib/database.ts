import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type RunResult = { meta: { changes: number } };

class AppStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  bind(...values: unknown[]) { this.values = values as SQLInputValue[]; return this; }
  run(): RunResult { const result = this.statement.run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  first<T>(): T | null { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  all<T = Record<string, unknown>>(): { results: T[] } { return { results: this.statement.all(...this.values) as T[] }; }
}

export class AppDatabase {
  private transactionDepth=0;
  private savepointSequence=0;
  constructor(private readonly database: DatabaseSync) {}
  exec(sql: string) { this.database.exec(sql); }
  prepare(sql: string) { return new AppStatement(this.database.prepare(sql)); }
  transaction<T>(operation:()=>T):T {
    if(this.transactionDepth===0){this.database.exec("BEGIN IMMEDIATE");this.transactionDepth++;try{const result=operation();this.database.exec("COMMIT");return result;}catch(error){this.database.exec("ROLLBACK");throw error;}finally{this.transactionDepth--;}}
    const savepoint=`app_tx_${++this.savepointSequence}`;this.database.exec(`SAVEPOINT ${savepoint}`);this.transactionDepth++;
    try{const result=operation();this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);return result;}catch(error){this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);throw error;}finally{this.transactionDepth--;}
  }
  batch(statements: AppStatement[]) { return this.transaction(()=>statements.map(statement=>statement.run())); }
}

declare global { var __oneShowSeoDatabase: AppDatabase | undefined; }

export function database(): AppDatabase {
  if (globalThis.__oneShowSeoDatabase) return globalThis.__oneShowSeoDatabase;
  const path = process.env.DATABASE_PATH || join(process.cwd(), "data", "oneshowseo.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  globalThis.__oneShowSeoDatabase = new AppDatabase(sqlite);
  return globalThis.__oneShowSeoDatabase;
}
