export type RolloutPhase = "off" | "internal" | "canary" | "paid" | "paused";

export type RolloutGate = {
  key: string;
  passed: boolean;
  evidence: string;
  observedAt: number;
};

export type RolloutObservation = {
  windowMinutes: number;
  minimumRequests: number;
  maximumErrorRate: number;
  maximumP95Milliseconds: number;
  maximumLedgerMismatch: number;
  rollbackOnAlert: boolean;
};

export type ReleaseRollout = {
  id: string;
  release: string;
  capability: string;
  phase: RolloutPhase;
  cohort: string;
  featureFlagKey: string;
  gates: RolloutGate[];
  observation: RolloutObservation;
  reason: string;
  actorId: string;
  correlationId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type RolloutChange = Omit<ReleaseRollout, "id" | "version" | "createdAt" | "updatedAt"> & {
  expectedVersion?: number;
};

export interface ReleaseRolloutRepository {
  current(release: string, capability: string): Promise<ReleaseRollout | null>;
  save(change: RolloutChange): Promise<ReleaseRollout>;
}

const requiredGates = ["schema", "migration_invariants", "rollback", "tests", "health", "monitoring", "browser"] as const;
const allowed: Record<RolloutPhase, RolloutPhase[]> = {
  off: ["off", "internal"],
  internal: ["off", "internal", "canary", "paused"],
  canary: ["off", "canary", "paid", "paused"],
  paid: ["off", "paid", "paused"],
  paused: ["off", "internal", "canary", "paid", "paused"],
};

export class ReleaseRolloutService {
  constructor(private readonly repository: ReleaseRolloutRepository) {}

  async change(input: RolloutChange): Promise<ReleaseRollout> {
    if (!input.reason.trim()) throw new Error("ROLLOUT_REASON_REQUIRED");
    if (!input.correlationId.trim()) throw new Error("ROLLOUT_CORRELATION_REQUIRED");
    const previous = await this.repository.current(input.release, input.capability);
    const from = previous?.phase ?? "off";
    if (!allowed[from].includes(input.phase)) throw new Error(`ROLLOUT_TRANSITION_INVALID:${from}:${input.phase}`);
    if (input.phase !== "off" && input.phase !== "paused") {
      const failures = requiredGates.filter(key => !input.gates.some(gate => gate.key === key && gate.passed && gate.evidence.trim()));
      if (failures.length) throw new Error(`ROLLOUT_GATES_INCOMPLETE:${failures.join(",")}`);
      if (input.observation.windowMinutes < 15 || input.observation.minimumRequests < 1 || input.observation.maximumErrorRate < 0 || input.observation.maximumErrorRate > 1 || input.observation.maximumP95Milliseconds < 1 || input.observation.maximumLedgerMismatch !== 0 || !input.observation.rollbackOnAlert) throw new Error("ROLLOUT_OBSERVATION_INVALID");
    }
    if (input.phase === "internal" && input.cohort !== "employees") throw new Error("ROLLOUT_INTERNAL_COHORT_INVALID");
    if (input.phase === "canary" && !input.cohort.startsWith("organization:")) throw new Error("ROLLOUT_CANARY_COHORT_INVALID");
    if (input.phase === "paid" && !input.cohort.startsWith("plan:")) throw new Error("ROLLOUT_PAID_COHORT_INVALID");
    return this.repository.save(input);
  }

  async disable(release: string, capability: string, actorId: string, correlationId: string, reason: string): Promise<ReleaseRollout> {
    const previous = await this.repository.current(release, capability);
    if (!previous) throw new Error("ROLLOUT_NOT_FOUND");
    return this.change({...previous, phase:"off", cohort:"*", actorId, correlationId, reason, expectedVersion:previous.version});
  }
}
