import { describe, expect, it, vi } from "vitest";
import type {
  ClaimPublicationOperationInput,
  PublicationCheckpointInput,
  PublicationOperationRecord,
  PublicCatalogV2ProjectionPage
} from "../src/modules/public-catalog-v2/public-catalog-v2.types.js";

const orchestratorModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.orchestrator.js";

describe("public catalog v2 orchestrator", () => {
  it("runs one immediate boot scan when the gated runtime starts", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
      start(): void;
      stop(): Promise<void>;
    };
    const repository = createOrchestratorRepositoryFake({ claimable: false });
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      repository,
      runIntervalMs: 60_000
    }));

    orchestrator.start();
    await Promise.resolve();
    await orchestrator.stop();

    expect(repository.claimNextPublicationOperation).toHaveBeenCalledTimes(1);
  });

  it("claims a durable lease before running the release pipeline and never fabricates running when disabled or unclaimed", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const disabledRepository = createOrchestratorRepositoryFake({ claimable: true });
    const disabled = createPublicCatalogV2Orchestrator(orchestratorOptions({
      enabled: false,
      repository: disabledRepository
    }));

    await expect(disabled.runOnce()).resolves.toEqual({
      claimed: false,
      reason: "disabled",
      status: "idle"
    });
    expect(disabledRepository.claimNextPublicationOperation).not.toHaveBeenCalled();

    const emptyRepository = createOrchestratorRepositoryFake({ claimable: false });
    const empty = createPublicCatalogV2Orchestrator(orchestratorOptions({ repository: emptyRepository }));

    await expect(empty.runOnce()).resolves.toEqual({
      claimed: false,
      reason: "no_claimable_operation",
      status: "idle"
    });
    expect(emptyRepository.recordPublicationCheckpoint).not.toHaveBeenCalled();

    const repository = createOrchestratorRepositoryFake({ claimable: true });
    const releaseBuilder = vi.fn(async () => syntheticRelease());
    const releaseUploader = vi.fn(async () => ({
      immutableArtifactsVerified: 5,
      replayedImmutableArtifacts: [],
      uploadOrder: ["manifest"]
    }));
    const activePointerUploader = vi.fn(async () => ({
      activePointer: {
        manifestSha256: "a".repeat(64),
        path: "public-catalog/v2/active.json",
        revision: 7,
        sha256: "b".repeat(64)
      },
      uploadOrder: ["active"]
    }));
    const finalizer = vi.fn(async () => ({
      buttonLabel: "Опубликовано",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Опубликовано",
      status: "succeeded"
    }));
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      finalizer,
      activePointerUploader,
      releaseBuilder,
      releaseUploader,
      repository
    }));

    const result = await orchestrator.runOnce();

    expect(result).toMatchObject({
      claimed: true,
      leaseId: "synthetic-lease-001",
      operationId: "00000000-0000-4000-8000-00000000feed",
      status: "succeeded"
    });
    expect(repository.claimNextPublicationOperation).toHaveBeenCalledWith({
      leaseId: "synthetic-lease-001",
      lockedBy: "web00-opv2-worker-01",
      now: fixedNow(),
      staleLockedBefore: new Date("2026-08-03T18:00:00.000Z")
    });
    expect(repository.claimedOperation?.status).toBe("running");
    expect(repository.claimedOperation?.leaseId).toBe("synthetic-lease-001");
    expect(repository.claimedOperation?.lockedBy).toBe("web00-opv2-worker-01");
    expect(releaseBuilder).toHaveBeenCalledWith(expect.objectContaining({
      generatedAt: fixedNow(),
      pages: expect.anything(),
      revision: 7,
      settings: { showDemoInModal: true }
    }));
    expect(repository.iteratePublicCatalogV2ProjectionPages).toHaveBeenCalledWith({
      afterCursor: null,
      operation: {
        action: "publish",
        siteId: "00000000-0000-4000-8000-000000000101"
      },
      take: 100
    });
    expect(releaseUploader).toHaveBeenCalledWith(expect.objectContaining({
      release: syntheticRelease()
    }));
    expect(activePointerUploader).toHaveBeenCalledWith(expect.objectContaining({
      activatedAt: fixedNow(),
      previousRevision: 6,
      release: syntheticRelease()
    }));
    expect(finalizer).toHaveBeenCalledWith(expect.objectContaining({
      activePointer: expect.objectContaining({
        path: "public-catalog/v2/active.json",
        revision: 7
      }),
      leaseId: "synthetic-lease-001",
      operation: expect.objectContaining({
        id: "00000000-0000-4000-8000-00000000feed",
        status: "running"
      }),
      repository: expect.any(Object),
      release: syntheticRelease()
    }));
    expect(repository.recordedStages).toEqual([
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
    ]);
  });

  it("resumes a verified post-active checkpoint at DB finalization without rebuilding or reuploading artifacts", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const repository = createOrchestratorRepositoryFake({
      claimable: true,
      operation: {
        lastCheckpoint: {
          activePointer: {
            manifestSha256: "a".repeat(64),
            path: "public-catalog/v2/active.json",
            previousRevision: 6,
            revision: 7,
            sha256: "b".repeat(64)
          },
          release: syntheticRelease(),
          revision: 7
        },
        stage: "active_verify"
      }
    });
    const releaseBuilder = vi.fn(async () => syntheticRelease());
    const releaseUploader = vi.fn(async () => ({
      immutableArtifactsVerified: 0,
      replayedImmutableArtifacts: [],
      uploadOrder: []
    }));
    const activePointerUploader = vi.fn(async () => ({
      activePointer: {},
      uploadOrder: []
    }));
    const finalizer = vi.fn(async () => ({ status: "succeeded" }));
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      activePointerUploader,
      finalizer,
      releaseBuilder,
      releaseUploader,
      repository
    }));

    await expect(orchestrator.runOnce()).resolves.toMatchObject({
      claimed: true,
      operationId: "00000000-0000-4000-8000-00000000feed",
      status: "succeeded"
    });
    expect(releaseBuilder).not.toHaveBeenCalled();
    expect(releaseUploader).not.toHaveBeenCalled();
    expect(activePointerUploader).not.toHaveBeenCalled();
    expect(repository.recordedStages).toEqual(["db_finalize"]);
    expect(finalizer).toHaveBeenCalledWith(expect.objectContaining({
      activePointer: expect.objectContaining({
        previousRevision: 6,
        revision: 7
      }),
      release: syntheticRelease()
    }));
  });

  it("persists a verified release row after immutable verification and before the active pointer is uploaded", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const repository = createOrchestratorRepositoryFake({ claimable: true });
    const releaseUploader = vi.fn(async () => ({
      immutableArtifactsVerified: 5,
      replayedImmutableArtifacts: [],
      uploadOrder: ["manifest"]
    }));
    const activePointerUploader = vi.fn(async () => ({
      activePointer: {
        manifestSha256: "a".repeat(64),
        path: "public-catalog/v2/active.json",
        revision: 7,
        sha256: "b".repeat(64)
      },
      uploadOrder: ["active"]
    }));
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      activePointerUploader,
      releaseUploader,
      repository
    }));

    await expect(orchestrator.runOnce()).resolves.toMatchObject({
      claimed: true,
      status: "succeeded"
    });

    expect(repository.recordVerifiedPublicCatalogV2Release).toHaveBeenCalledWith({
      generatedAt: fixedNow(),
      release: syntheticRelease()
    });
    expect(releaseUploader.mock.invocationCallOrder[0]).toBeLessThan(
      repository.recordVerifiedPublicCatalogV2Release.mock.invocationCallOrder[0]!
    );
    expect(repository.recordVerifiedPublicCatalogV2Release.mock.invocationCallOrder[0]).toBeLessThan(
      activePointerUploader.mock.invocationCallOrder[0]!
    );
    expect(repository.recordVerifiedPublicCatalogV2Release.mock.invocationCallOrder[0]).toBeGreaterThan(
      releaseUploader.mock.invocationCallOrder[0]!
    );
  });

  it("revalidates the active pointer lease inside the current-target guard before storage upload", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const repository = createOrchestratorRepositoryFake({ claimable: true });
    repository.withCurrentPublicationTarget.mockImplementation(async (_input, callback) => {
      const guardedRepository = {
        ...repository,
        recordPublicationCheckpoint: vi.fn(async (input: PublicationCheckpointInput) => {
          if (input.stage === "active_build") {
            throw Object.assign(new Error("Synthetic stolen active lease."), {
              code: "PUBLIC_CATALOG_V2_LEASE_NOT_HELD"
            });
          }

          return repository.recordPublicationCheckpoint(input);
        })
      };

      return callback(guardedRepository);
    });
    const activePointerUploader = vi.fn(async () => activePointerResult());
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      activePointerUploader,
      repository
    }));

    await expect(orchestrator.runOnce()).resolves.toMatchObject({
      claimed: true,
      status: "retry_wait"
    });

    expect(activePointerUploader).not.toHaveBeenCalled();
    expect(repository.recordPublicationCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      lastErrorCode: "PUBLIC_CATALOG_V2_LEASE_NOT_HELD",
      operationId: "00000000-0000-4000-8000-00000000feed",
      status: "retry_wait"
    }));
  });

  it("bounds active pointer storage I/O with an abort signal shorter than the stale-lease window", async () => {
    vi.useFakeTimers();
    try {
      const module = await importOrchestratorModule();
      const createPublicCatalogV2Orchestrator = readFunction(
        module,
        "createPublicCatalogV2Orchestrator"
      ) as (options: OrchestratorOptions & { activePointerTimeoutMs?: number }) => {
        runOnce(): Promise<Record<string, unknown>>;
      };
      const repository = createOrchestratorRepositoryFake({ claimable: true });
      const activePointerUploader = vi.fn(async (input: Record<string, unknown>) => {
        const signal = input.signal;
        if (!(signal instanceof AbortSignal)) {
          return activePointerResult();
        }

        return await new Promise<Record<string, unknown>>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason);
          }, { once: true });
        });
      });
      const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
        activePointerTimeoutMs: 10,
        activePointerUploader,
        leaseTtlMs: 60_000,
        repository
      } as Partial<OrchestratorOptions> & { activePointerTimeoutMs: number }));

      const run = orchestrator.runOnce();
      await vi.advanceTimersByTimeAsync(10);

      await expect(run).resolves.toMatchObject({
        claimed: true,
        status: "retry_wait"
      });
      expect(activePointerUploader.mock.calls[0]?.[0]).toMatchObject({
        signal: expect.any(AbortSignal)
      });
      expect(repository.recordPublicationCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
        lastErrorCode: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT",
        status: "retry_wait"
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists active pointer evidence immediately after upload when read-back later aborts", async () => {
    const module = await importOrchestratorModule();
    const createPublicCatalogV2Orchestrator = readFunction(
      module,
      "createPublicCatalogV2Orchestrator"
    ) as (options: OrchestratorOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const repository = createOrchestratorRepositoryFake({ claimable: true });
    const activePointerUploader = vi.fn(async (input: Record<string, unknown>) => {
      const onActivePointerUploaded = input.onActivePointerUploaded;
      if (typeof onActivePointerUploaded !== "function") {
        throw Object.assign(new Error("Synthetic active upload callback missing."), {
          code: "PUBLIC_CATALOG_V2_ACTIVE_UPLOAD_CHECKPOINT_MISSING"
        });
      }

      await onActivePointerUploaded(activePointerResult().activePointer);
      throw Object.assign(new Error("Synthetic active read-back timeout."), {
        code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT"
      });
    });
    const orchestrator = createPublicCatalogV2Orchestrator(orchestratorOptions({
      activePointerUploader,
      repository
    }));

    await expect(orchestrator.runOnce()).resolves.toMatchObject({
      claimed: true,
      status: "retry_wait"
    });

    expect(repository.recordPublicationCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      lastCheckpoint: expect.objectContaining({
        activePointer: expect.objectContaining({
          path: "public-catalog/v2/active.json",
          revision: 7
        }),
        release: syntheticRelease(),
        revision: 7
      }),
      stage: "active_upload"
    }));
    expect(repository.recordPublicationCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      lastErrorCode: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_TIMEOUT",
      status: "retry_wait"
    }));
  });
});

interface OrchestratorOptions {
  enabled?: boolean;
  finalizer: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  leaseId: () => string;
  leaseTtlMs: number;
  now: () => Date;
  releaseBuilder: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  releaseUploader: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  activePointerUploader: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  repository: ReturnType<typeof createOrchestratorRepositoryFake>;
  runIntervalMs?: number;
  workerId: string;
}

async function importOrchestratorModule(): Promise<Record<string, unknown>> {
  try {
    return await import(orchestratorModulePath);
  } catch (error) {
    throw new Error("Expected public catalog V2 orchestrator module to exist for OPV2-5.", { cause: error });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected orchestrator export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

function orchestratorOptions(overrides: Partial<OrchestratorOptions> = {}): OrchestratorOptions {
  return {
    enabled: true,
    finalizer: vi.fn(async () => ({
      buttonLabel: "Опубликовано",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Опубликовано",
      status: "succeeded"
    })),
    leaseId: () => "synthetic-lease-001",
    leaseTtlMs: 60_000,
    now: fixedNow,
    releaseBuilder: vi.fn(async () => syntheticRelease()),
    releaseUploader: vi.fn(async () => ({
      immutableArtifactsVerified: 5,
      replayedImmutableArtifacts: [],
      uploadOrder: ["manifest"]
    })),
    activePointerUploader: vi.fn(async () => ({
      activePointer: {
        manifestSha256: "a".repeat(64),
        path: "public-catalog/v2/active.json",
        revision: 7,
        sha256: "b".repeat(64)
      },
      uploadOrder: ["active"]
    })),
    repository: createOrchestratorRepositoryFake({ claimable: true }),
    workerId: "web00-opv2-worker-01",
    ...overrides
  };
}

function createOrchestratorRepositoryFake(options: {
  claimable: boolean;
  operation?: Partial<PublicationOperationRecord>;
}) {
  const recordedStages: string[] = [];
  const operation = operationRecord(options.operation);
  const repository = {
    claimNextPublicationOperation: vi.fn(async (input: ClaimPublicationOperationInput) => {
      if (!options.claimable) {
        return null;
      }
      operation.status = "running";
      operation.leaseId = input.leaseId;
      operation.lockedAt = input.now;
      operation.lockedBy = input.lockedBy;

      return operation;
    }),
    claimedOperation: operation as PublicationOperationRecord | null,
    finalizePublicationOperation: vi.fn(),
    iteratePublicCatalogV2ProjectionPages: vi.fn(async function* () {
      yield projectionPage();
    }),
    previousRevision: 6,
    recordVerifiedPublicCatalogV2Release: vi.fn(async () => undefined),
    recordActivationEvent: vi.fn(),
    recordedStages,
    recordPublicationCheckpoint: vi.fn(async (input: PublicationCheckpointInput) => {
      recordedStages.push(input.stage);
      operation.stage = input.stage;
      operation.lastCheckpoint = input.lastCheckpoint;

      return operation;
    }),
    settings: { showDemoInModal: true },
    withCurrentPublicationTarget: vi.fn(async (_input, callback) => callback(repository))
  };

  return repository;
}

function operationRecord(overrides: Partial<PublicationOperationRecord> = {}): PublicationOperationRecord {
  const now = fixedNow();

  return {
    action: "publish",
    actorUserId: "00000000-0000-4000-8000-000000000001",
    completedAt: null,
    createdAt: now,
    id: "00000000-0000-4000-8000-00000000feed",
    idempotencyKey: "00000000-0000-4000-8000-0000000000a7",
    lastCheckpoint: {},
    lastErrorCode: null,
    leaseId: null,
    lockedAt: null,
    lockedBy: null,
    nextRetryAt: null,
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "req_orchestrator",
    retryCount: 0,
    siteId: "00000000-0000-4000-8000-000000000101",
    stage: "content_transaction",
    status: "queued",
    targetRevision: 7,
    trigger: "site_publication",
    updatedAt: now,
    ...overrides
  };
}

function projectionPage(): PublicCatalogV2ProjectionPage {
  return {
    items: [],
    nextCursor: null
  };
}

function syntheticRelease(): Record<string, unknown> {
  return {
    active: {
      path: "public-catalog/v2/active.json",
      revision: 7
    },
    activationInput: {
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "a".repeat(64),
      revision: 7
    },
    artifacts: [],
    chunks: [],
    manifest: {
      itemsCount: 1,
      revision: 7,
      sha256: "a".repeat(64)
    }
  };
}

function activePointerResult(): Record<string, unknown> {
  return {
    activePointer: {
      manifestSha256: "a".repeat(64),
      path: "public-catalog/v2/active.json",
      revision: 7,
      sha256: "b".repeat(64)
    },
    uploadOrder: ["active"]
  };
}

function fixedNow(): Date {
  return new Date("2026-08-03T18:01:00.000Z");
}
