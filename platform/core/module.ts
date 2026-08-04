import type { RequestContext } from "./contracts";

export type Repository<TEntity, TId> = {
  findById(context: RequestContext, id: TId): Promise<TEntity | null>;
  save(context: RequestContext, entity: TEntity): Promise<TEntity>;
};

export type Transaction = { commit(): Promise<void>; rollback(): Promise<void> };
export type TransactionManager = { begin(): Promise<Transaction> };

export type DomainEvent<TPayload = Record<string, unknown>> = {
  id: string;
  type: string;
  version: number;
  aggregateId: string;
  organizationId?: string;
  projectId?: string;
  correlationId: string;
  occurredAt: number;
  payload: TPayload;
};

export type EventPublisher = { publish(event: DomainEvent): Promise<void> };
