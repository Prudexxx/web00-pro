import { randomUUID } from "node:crypto";

const DEFAULT_RECONCILER_LEASE_TTL_MS = 60_000;
const DEFAULT_RECONCILER_INTERVAL_MS = 30_000;
const DEFAULT_RECONCILER_WORKER_ID = "web00-public-catalog-v2-reconciler";

export interface PublicCatalogV2Reconciler {
  runOnce(): Promise<PublicCatalogV2ReconcilerRunResult>;
  start(): void;
  stop(): Promise<void>;
}

export interface PublicCatalogV2ReconcilerRunResult {
  failed: number;
  reconciled: number;
}

export interface PublicCatalogV2ReconcilerOptions {
  enabled?: boolean;
  finalizer: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  leaseId?: () => string;
  leaseTtlMs?: number;
  now?: () => Date;
  repository: {
    findPostActivationFinalizationGaps(input: {
      leaseId: string;
      now: Date;
      staleLockedBefore: Date;
      workerId: string;
    }): Promise<Array<{
      activePointer: Record<string, unknown>;
      leaseId?: string | null;
      operation: unknown;
      release: Record<string, unknown>;
    }>>;
  };
  runIntervalMs?: number;
  workerId?: string;
}

export function createPublicCatalogV2Reconciler(
  options: PublicCatalogV2ReconcilerOptions
): PublicCatalogV2Reconciler {
  const enabled = options.enabled ?? true;
  const leaseId = options.leaseId ?? randomUUID;
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_RECONCILER_LEASE_TTL_MS;
  const now = options.now ?? (() => new Date());
  const runIntervalMs = options.runIntervalMs ?? DEFAULT_RECONCILER_INTERVAL_MS;
  const workerId = options.workerId ?? DEFAULT_RECONCILER_WORKER_ID;
  let inFlight: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<PublicCatalogV2ReconcilerRunResult> {
    if (!enabled) {
      return {
        failed: 0,
        reconciled: 0
      };
    }

    const runAt = now();
    const currentLeaseId = leaseId();
    const gaps = await options.repository.findPostActivationFinalizationGaps({
      leaseId: currentLeaseId,
      now: runAt,
      staleLockedBefore: new Date(runAt.getTime() - leaseTtlMs),
      workerId
    });
    let failed = 0;
    let reconciled = 0;

    for (const gap of gaps) {
      try {
        await options.finalizer({
          activePointer: gap.activePointer,
          leaseId: gap.leaseId ?? null,
          operation: gap.operation,
          release: gap.release
        });
        reconciled += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      failed,
      reconciled
    };
  }

  function runGuarded(): void {
    if (inFlight !== null) {
      return;
    }
    inFlight = runOnce()
      .then(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }

  return {
    runOnce,
    start() {
      if (timer !== null || !enabled) {
        return;
      }
      runGuarded();
      timer = setInterval(runGuarded, runIntervalMs);
    },
    async stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      await inFlight;
    }
  };
}
