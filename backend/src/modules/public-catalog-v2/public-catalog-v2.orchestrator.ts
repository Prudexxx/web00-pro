import { randomUUID } from "node:crypto";
import type {
  PublicationOperationRecord,
  PublicCatalogV2OperationStage,
  PublicCatalogV2ProjectionOperationIntent,
  PublicCatalogV2ProjectionPage,
  PublicCatalogV2Repository,
  PublicCatalogV2Settings
} from "./public-catalog-v2.types.js";

const DEFAULT_LEASE_TTL_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_WORKER_ID = "web00-public-catalog-v2-worker";
const DEFAULT_RUN_INTERVAL_MS = 30_000;
const DEFAULT_ACTIVE_POINTER_TIMEOUT_MS = 15_000;

const RELEASE_PIPELINE_STAGES = [
  "media_preflight",
  "projection_page",
  "index_build",
  "chunk_build",
  "chunk_upload",
  "chunk_verify",
  "popular_build",
  "popular_upload",
  "popular_verify",
  "categories_build",
  "categories_upload",
  "categories_verify",
  "manifest_build",
  "manifest_upload",
  "manifest_verify",
  "active_build",
  "active_upload",
  "active_verify",
  "db_finalize"
] as const satisfies readonly PublicCatalogV2OperationStage[];
const RELEASE_PIPELINE_STAGE_SET = new Set<string>(RELEASE_PIPELINE_STAGES);
const POST_ACTIVE_RESUME_STAGES = new Set<string>(["active_upload", "active_verify", "db_finalize"]);

export interface PublicCatalogV2Orchestrator {
  runOnce(): Promise<PublicCatalogV2OrchestratorRunResult>;
  start(): void;
  stop(): Promise<void>;
}

export type PublicCatalogV2OrchestratorRunResult =
  | {
      claimed: false;
      reason: "disabled" | "no_claimable_operation";
      status: "idle";
    }
  | {
      claimed: true;
      leaseId: string;
      operationId: string;
      status: string;
    };

class PublicCatalogV2OrchestratorError extends Error {
  constructor(readonly code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT") {
    super(code);
    this.name = "PublicCatalogV2OrchestratorError";
  }
}

export interface PublicCatalogV2OrchestratorOptions {
  activePointerTimeoutMs?: number;
  enabled?: boolean;
  finalizer: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  leaseId?: () => string;
  leaseTtlMs?: number;
  now?: () => Date;
  releaseBuilder: (input: {
    generatedAt: Date;
    pages: AsyncIterable<PublicCatalogV2ProjectionPage>;
    revision: number;
    settings: PublicCatalogV2Settings;
  }) => Promise<Record<string, unknown>>;
  releaseUploader: (input: {
    release: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  activePointerUploader: (input: {
    activatedAt: Date;
    onActivePointerUploaded?: (activePointer: Record<string, unknown>) => Promise<void> | void;
    previousRevision: number | null;
    release: Record<string, unknown>;
    signal?: AbortSignal;
  }) => Promise<Record<string, unknown>>;
  repository: Pick<
    PublicCatalogV2Repository,
    | "claimNextPublicationOperation"
    | "iteratePublicCatalogV2ProjectionPages"
    | "recordPublicationCheckpoint"
    | "recordVerifiedPublicCatalogV2Release"
    | "withCurrentPublicationTarget"
  > & {
    previousRevision?: number | null;
    settings?: PublicCatalogV2Settings;
  };
  retryDelayMs?: number;
  runIntervalMs?: number;
  workerId?: string;
}

export function createPublicCatalogV2Orchestrator(
  options: PublicCatalogV2OrchestratorOptions
): PublicCatalogV2Orchestrator {
  const enabled = options.enabled ?? true;
  const leaseId = options.leaseId ?? randomUUID;
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const activePointerTimeoutMs = readActivePointerTimeoutMs(options.activePointerTimeoutMs, leaseTtlMs);
  const now = options.now ?? (() => new Date());
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const runIntervalMs = options.runIntervalMs ?? DEFAULT_RUN_INTERVAL_MS;
  const workerId = options.workerId ?? DEFAULT_WORKER_ID;
  let inFlight: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<PublicCatalogV2OrchestratorRunResult> {
    if (!enabled) {
      return {
        claimed: false,
        reason: "disabled",
        status: "idle"
      };
    }

    const startedAt = now();
    const currentLeaseId = leaseId();
    const operation = await options.repository.claimNextPublicationOperation({
      leaseId: currentLeaseId,
      lockedBy: workerId,
      now: startedAt,
      staleLockedBefore: new Date(startedAt.getTime() - leaseTtlMs)
    });

    if (operation === null) {
      return {
        claimed: false,
        reason: "no_claimable_operation",
        status: "idle"
      };
    }

    try {
      const postActiveResume = readPostActiveResumeCheckpoint(operation);
      if (postActiveResume !== null) {
        await checkpoint(options.repository, operation, currentLeaseId, "db_finalize", {
          activePointer: postActiveResume.activePointer,
          release: postActiveResume.release,
          resumedFromStage: operation.stage,
          revision: operation.targetRevision
        }, now());
        const finalized = await options.finalizer({
          activePointer: postActiveResume.activePointer,
          leaseId: currentLeaseId,
          operation,
          release: postActiveResume.release
        });

        return {
          claimed: true,
          leaseId: currentLeaseId,
          operationId: operation.id,
          status: typeof finalized.status === "string" ? finalized.status : "succeeded"
        };
      }

      await checkpoint(options.repository, operation, currentLeaseId, "media_preflight", {
        checkedAt: startedAt.toISOString()
      }, now());
      await checkpoint(options.repository, operation, currentLeaseId, "projection_page", {
        pageMode: "keyset"
      }, now());

      const releaseGeneratedAt = operation.createdAt;
      const release = await options.releaseBuilder({
        generatedAt: releaseGeneratedAt,
        pages: options.repository.iteratePublicCatalogV2ProjectionPages({
          afterCursor: null,
          operation: readProjectionOperationIntent(operation),
          take: 100
        }),
        revision: operation.targetRevision,
        settings: readSettings(options.repository)
      });

      for (const stage of RELEASE_PIPELINE_STAGES.slice(2, 15)) {
        await checkpoint(options.repository, operation, currentLeaseId, stage, {
          revision: operation.targetRevision
        }, now());
      }
      await options.releaseUploader({
        release
      });
      await options.repository.recordVerifiedPublicCatalogV2Release({
        generatedAt: releaseGeneratedAt,
        release
      });

      const finalized = await options.repository.withCurrentPublicationTarget({
        leaseId: currentLeaseId,
        now: now(),
        operationId: operation.id,
        revision: operation.targetRevision
      }, async (guardedRepository) => {
        await checkpoint(guardedRepository, operation, currentLeaseId, "active_build", {
          revision: operation.targetRevision
        }, now());
        let activeUploadCheckpointed = false;
        const uploadResult = await runActivePointerUpload({
          operation: (signal) => options.activePointerUploader({
            activatedAt: startedAt,
            onActivePointerUploaded: async (activePointer) => {
              await checkpoint(guardedRepository, operation, currentLeaseId, "active_upload", {
                activePointer,
                release,
                revision: operation.targetRevision
              }, now());
              activeUploadCheckpointed = true;
            },
            previousRevision: readPreviousRevision(options.repository),
            release,
            signal
          }),
          timeoutMs: activePointerTimeoutMs
        });
        const activePointer = readActivePointer(uploadResult);

        if (!activeUploadCheckpointed) {
          await checkpoint(guardedRepository, operation, currentLeaseId, "active_upload", {
            activePointer,
            release,
            revision: operation.targetRevision
          }, now());
        }
        await checkpoint(guardedRepository, operation, currentLeaseId, "active_verify", {
          activePointer,
          release,
          revision: operation.targetRevision
        }, now());
        await checkpoint(guardedRepository, operation, currentLeaseId, "db_finalize", {
          activePointer,
          release,
          revision: operation.targetRevision
        }, now());

        return options.finalizer({
          activePointer,
          leaseId: currentLeaseId,
          operation,
          repository: guardedRepository,
          release
        });
      });

      return {
        claimed: true,
        leaseId: currentLeaseId,
        operationId: operation.id,
        status: typeof finalized.status === "string" ? finalized.status : "succeeded"
      };
    } catch (error) {
      await options.repository.recordPublicationCheckpoint({
        lastCheckpoint: {
          ...(readRecord(operation.lastCheckpoint) ?? {}),
          failedAt: now().toISOString()
        },
        lastErrorCode: toSafeErrorCode(error),
        leaseId: currentLeaseId,
        nextRetryAt: new Date(now().getTime() + retryDelayMs),
        operationId: operation.id,
        retryCount: operation.retryCount + 1,
        stage: readOperationStage(operation.stage),
        status: "retry_wait"
      });

      return {
        claimed: true,
        leaseId: currentLeaseId,
        operationId: operation.id,
        status: "retry_wait"
      };
    }
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

async function checkpoint(
  repository: PublicCatalogV2OrchestratorOptions["repository"],
  operation: PublicationOperationRecord,
  leaseId: string,
  stage: PublicCatalogV2OperationStage,
  lastCheckpoint: Record<string, unknown>,
  now: Date = new Date()
): Promise<void> {
  operation.stage = stage;
  operation.lastCheckpoint = lastCheckpoint;
  await repository.recordPublicationCheckpoint({
    lastCheckpoint,
    leaseId,
    now,
    operationId: operation.id,
    stage
  });
}

async function runActivePointerUpload(input: {
  operation: (signal: AbortSignal) => Promise<Record<string, unknown>>;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new PublicCatalogV2OrchestratorError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT"));
  }, input.timeoutMs);

  try {
    const result = await input.operation(controller.signal);
    if (controller.signal.aborted) {
      throw readAbortReason(controller.signal);
    }

    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw readAbortReason(controller.signal);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readAbortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new PublicCatalogV2OrchestratorError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT");
}

function readActivePointerTimeoutMs(value: number | undefined, leaseTtlMs: number): number {
  const maximum = Math.max(1, leaseTtlMs - 1_000);
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    return Math.min(DEFAULT_ACTIVE_POINTER_TIMEOUT_MS, maximum);
  }

  return Math.min(value, maximum);
}

function readSettings(repository: PublicCatalogV2OrchestratorOptions["repository"]): PublicCatalogV2Settings {
  return repository.settings ?? { showDemoInModal: true };
}

function readPreviousRevision(repository: PublicCatalogV2OrchestratorOptions["repository"]): number | null {
  return Number.isSafeInteger(repository.previousRevision) ? (repository.previousRevision as number) : null;
}

function readProjectionOperationIntent(operation: PublicationOperationRecord): PublicCatalogV2ProjectionOperationIntent {
  return {
    action: readPublicationOperationAction(operation.action),
    siteId: operation.siteId
  };
}

function readActivePointer(uploadResult: Record<string, unknown>): Record<string, unknown> {
  const activePointer = uploadResult.activePointer;
  return typeof activePointer === "object" && activePointer !== null && !Array.isArray(activePointer)
    ? activePointer as Record<string, unknown>
    : {};
}

function readPostActiveResumeCheckpoint(operation: PublicationOperationRecord): {
  activePointer: Record<string, unknown>;
  release: Record<string, unknown>;
} | null {
  if (!POST_ACTIVE_RESUME_STAGES.has(operation.stage)) {
    return null;
  }

  const checkpoint = readRecord(operation.lastCheckpoint);
  const activePointer = readRecord(checkpoint?.activePointer);
  const release = readRecord(checkpoint?.release);
  const revision = checkpoint?.revision;
  if (
    activePointer === null ||
    release === null ||
    revision !== operation.targetRevision
  ) {
    return null;
  }

  return { activePointer, release };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPublicationOperationAction(value: string): PublicCatalogV2ProjectionOperationIntent["action"] {
  if (value === "publish" || value === "unpublish" || value === "settings_publish" || value === "reconcile") {
    return value;
  }

  return "reconcile";
}

function readOperationStage(stage: string): PublicCatalogV2OperationStage {
  return RELEASE_PIPELINE_STAGE_SET.has(stage)
    ? stage as PublicCatalogV2OperationStage
    : "content_transaction";
}

function toSafeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^[A-Z0-9_]+$/.test((error as { code: string }).code)
  ) {
    return (error as { code: string }).code;
  }

  return "PUBLIC_CATALOG_V2_ORCHESTRATOR_FAILED";
}
