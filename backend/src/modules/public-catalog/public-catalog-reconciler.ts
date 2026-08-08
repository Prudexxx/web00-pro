import type { PublicCatalogSyncService } from "./public-catalog-sync.service.js";

export interface PublicCatalogReconcileRequest {
  reason: string;
  requestId: string;
}

export interface PublicCatalogReconciler {
  requestReconcile(input: PublicCatalogReconcileRequest): void;
  start(): void;
  stop(): Promise<void>;
}

export type PublicCatalogReconcilerForTest = PublicCatalogReconciler & {
  drainForTest(): Promise<void>;
};

export function createPublicCatalogReconciler(options: {
  createRequestId?: () => string;
  initialDelayMs?: number;
  maxAttempts?: number;
  maxDelayMs?: number;
  onError?: (error: unknown) => void;
  syncService: PublicCatalogSyncService;
}): PublicCatalogReconcilerForTest {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 8;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  let activeRun: Promise<void> | null = null;
  let queuedRequests = 0;
  let retryDelayResolve: (() => void) | null = null;
  let retryDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delayMs: number): void {
    if (stopped || timer !== null || activeRun !== null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      activeRun = runLoop().finally(() => {
        activeRun = null;
        if (queuedRequests > 0 && !stopped) {
          schedule(0);
        }
      });
    }, delayMs);
  }

  async function runLoop(): Promise<void> {
    try {
      while (!stopped && queuedRequests > 0) {
        const coalescedRequests = queuedRequests;
        queuedRequests = 0;
        let attempts = 0;
        let coalescedFollowUp = coalescedRequests > 1;

        while (!stopped) {
          attempts += 1;
          const result = await options.syncService.syncOnce({ requestId: createRequestId() });
          if (result.status === "ready") {
            break;
          }
          if (result.status === "pending") {
            if (queuedRequests > 0) {
              break;
            }
            if (coalescedFollowUp) {
              coalescedFollowUp = false;
              continue;
            }
            if (attempts >= maxAttempts) {
              break;
            }
            await retryDelay(Math.min(maxDelayMs, initialDelayMs * 2 ** (attempts - 1)));
            continue;
          }
          if (attempts >= maxAttempts) {
            break;
          }
          await retryDelay(Math.min(maxDelayMs, initialDelayMs * 2 ** (attempts - 1)));
        }
      }
    } catch (error) {
      options.onError?.(error);
    }
  }

  function cancelRetryDelay(): void {
    if (retryDelayTimer !== null) {
      clearTimeout(retryDelayTimer);
      retryDelayTimer = null;
    }
    const resolve = retryDelayResolve;
    retryDelayResolve = null;
    resolve?.();
  }

  function retryDelay(milliseconds: number): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      retryDelayResolve = resolve;
      retryDelayTimer = setTimeout(() => {
        retryDelayTimer = null;
        retryDelayResolve = null;
        resolve();
      }, milliseconds);
    });
  }

  return {
    async drainForTest() {
      for (;;) {
        if (timer !== null || activeRun !== null) {
          await delay(0);
          continue;
        }
        if (queuedRequests === 0) {
          return;
        }
        schedule(0);
      }
    },
    requestReconcile() {
      if (stopped) {
        return;
      }
      queuedRequests += 1;
      schedule(0);
    },
    start() {
      if (stopped) {
        return;
      }
      queuedRequests += 1;
      schedule(0);
    },
    async stop() {
      stopped = true;
      queuedRequests = 0;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      cancelRetryDelay();
      if (activeRun !== null) {
        await activeRun;
      }
    }
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
