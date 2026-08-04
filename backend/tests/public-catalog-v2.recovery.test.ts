import { describe, expect, it, vi } from "vitest";
import type { PublicationOperationRecord } from "../src/modules/public-catalog-v2/public-catalog-v2.types.js";

const publicationModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.publication.js";
const repositoryModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.repository.js";
const reconcilerModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.reconciler.js";

describe("public catalog v2 publication recovery", () => {
  it("maps to published success only after active pointer, immutable release, parity, activation event and DB finalization pass", async () => {
    const module = await importPublicationModule();
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: FinalizePublicationSuccessInput
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationFinalizerDependenciesFake();
    dependencies.readActivePointer = vi.fn(async () => {
      dependencies.callOrder.push("active_pointer_read_back");
      return activePointerFixture({ previousRevision: 6 });
    });

    const result = await finalizePublicationSuccess({
      activePointer: activePointerFixture(),
      dependencies,
      leaseId: "synthetic-lease-001",
      now: fixedNow,
      operation: operationRecord({ status: "running" }),
      release: releaseFixture()
    });

    expect(result).toEqual({
      activePointerReadBack: "verified",
      buttonLabel: "Опубликовано",
      dbFinalized: true,
      immutableReleaseVerified: true,
      operationId: "00000000-0000-4000-8000-00000000feed",
      publicCardParity: "verified",
      retryable: false,
      stableStatus: "Опубликовано",
      status: "succeeded",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(dependencies.callOrder).toEqual([
      "db_content_state",
      "active_pointer_read_back",
      "immutable_release_read_back",
      "public_card_parity",
      "finalize_transaction"
    ]);
    expect(dependencies.finalizePublicationTransaction).toHaveBeenCalledWith(expect.objectContaining({
      activePointerSha256: "e".repeat(64),
      action: "publish",
      eventType: "activate",
      expectedPublicState: "published",
      previousRevision: 6,
      revision: 7
    }));

    const failedDependencies = createPublicationFinalizerDependenciesFake({
      readActivePointer: vi.fn(async () => ({
        manifestPath: "public-catalog/v2/releases/revision-6/manifest.json",
        manifestSha256: "c".repeat(64),
        revision: 6,
        sha256: "e".repeat(64)
      }))
    });

    await expect(
      finalizePublicationSuccess({
        activePointer: activePointerFixture(),
        dependencies: failedDependencies,
        leaseId: "synthetic-lease-001",
        now: fixedNow,
        operation: operationRecord({ status: "running" }),
        release: releaseFixture()
      })
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH" });
    expect(failedDependencies.assertPublicCardParity).not.toHaveBeenCalled();
    expect(failedDependencies.finalizePublicationTransaction).not.toHaveBeenCalled();
  });

  it("maps verified unpublish finalization to a not-published terminal DTO", async () => {
    const module = await importPublicationModule();
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: FinalizePublicationSuccessInput
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationFinalizerDependenciesFake();

    const result = await finalizePublicationSuccess({
      activePointer: activePointerFixture(),
      dependencies,
      leaseId: "synthetic-lease-001",
      now: fixedNow,
      operation: operationRecord({ action: "unpublish", status: "running" }),
      release: releaseFixture()
    });

    expect(result).toMatchObject({
      buttonLabel: "Опубликовать",
      retryable: false,
      stableStatus: "Не опубликовано",
      status: "succeeded"
    });
    expect(dependencies.assertPublicCardParity).toHaveBeenCalledWith(expect.objectContaining({
      expectedPresence: "absent"
    }));
    expect(dependencies.finalizePublicationTransaction).toHaveBeenCalledWith(expect.objectContaining({
      action: "unpublish",
      expectedPublicState: "unpublished"
    }));
  });

  it.each([
    ["active pointer SHA", {
      readActivePointer: vi.fn(async () => ({
        ...activePointerFixture(),
        sha256: "0".repeat(64)
      }))
    }],
    ["immutable manifest path", {
      readImmutableRelease: vi.fn(async () => ({
        ...immutableReleaseReadBackFixture(),
        manifestPath: "public-catalog/v2/releases/revision-7/wrong.json"
      }))
    }],
    ["immutable manifest SHA", {
      readImmutableRelease: vi.fn(async () => ({
        ...immutableReleaseReadBackFixture(),
        manifestSha256: "1".repeat(64)
      }))
    }],
    ["immutable artifact descriptors", {
      readImmutableRelease: vi.fn(async () => ({
        ...immutableReleaseReadBackFixture(),
        artifacts: [{ kind: "index", path: "public-catalog/v2/releases/revision-7/index.json", sha256: "2".repeat(64) }]
      }))
    }]
  ])("rejects %s mismatch before terminal success", async (_caseName, overrides) => {
    const module = await importPublicationModule();
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: FinalizePublicationSuccessInput
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationFinalizerDependenciesFake(overrides);

    await expect(
      finalizePublicationSuccess({
        activePointer: activePointerFixture(),
        dependencies,
        leaseId: "synthetic-lease-001",
        now: fixedNow,
        operation: operationRecord({ status: "running" }),
        release: releaseFixture()
      })
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH" });
    expect(dependencies.assertPublicCardParity).not.toHaveBeenCalled();
    expect(dependencies.finalizePublicationTransaction).not.toHaveBeenCalled();
  });

  it("rejects a verified release whose revision does not match the claimed operation target revision", async () => {
    const module = await importPublicationModule();
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: FinalizePublicationSuccessInput
    ) => Promise<Record<string, unknown>>;
    const release = releaseFixture();
    const activationInput = release.activationInput as Record<string, unknown>;
    const manifest = release.manifest as Record<string, unknown>;
    activationInput.revision = 8;
    manifest.revision = 8;
    const dependencies = createPublicationFinalizerDependenciesFake();
    dependencies.readActivePointer = vi.fn(async () => {
      dependencies.callOrder.push("active_pointer_read_back");
      return activePointerFixture({ revision: 8 });
    });
    dependencies.readImmutableRelease = vi.fn(async () => {
      dependencies.callOrder.push("immutable_release_read_back");
      return {
        ...immutableReleaseReadBackFixture(),
        revision: 8
      };
    });

    await expect(
      finalizePublicationSuccess({
        activePointer: activePointerFixture({ revision: 8 }),
        dependencies,
        leaseId: "synthetic-lease-001",
        now: fixedNow,
        operation: operationRecord({ status: "running", targetRevision: 7 }),
        release
      })
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH" });
    expect(dependencies.assertPublicCardParity).not.toHaveBeenCalled();
    expect(dependencies.finalizePublicationTransaction).not.toHaveBeenCalled();
  });

  it("reconciles a post-activation restart gap without issuing a second HTTP publication request", async () => {
    const module = await importReconcilerModule();
    const createPublicCatalogV2Reconciler = readFunction(
      module,
      "createPublicCatalogV2Reconciler"
    ) as (options: ReconcilerOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
    };
    const repository = createReconcilerRepositoryFake();
    const finalizer = vi.fn(async () => ({
      buttonLabel: "Опубликовано",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Опубликовано",
      status: "succeeded"
    }));
    const startPublication = vi.fn();
    const reconciler = createPublicCatalogV2Reconciler({
      finalizer,
      now: fixedNow,
      repository,
      workerId: "web00-opv2-reconciler-01"
    });

    await expect(reconciler.runOnce()).resolves.toEqual({
      failed: 0,
      reconciled: 1
    });
    expect(startPublication).not.toHaveBeenCalled();
    expect(repository.findPostActivationFinalizationGaps).toHaveBeenCalledWith({
      now: fixedNow(),
      staleLockedBefore: new Date("2026-08-03T18:03:00.000Z"),
      workerId: "web00-opv2-reconciler-01"
    });
    expect(finalizer).toHaveBeenCalledWith(expect.objectContaining({
      activePointer: activePointerFixture(),
      operation: expect.objectContaining({
        id: "00000000-0000-4000-8000-00000000feed",
        status: "running"
      }),
      release: releaseFixture()
    }));
  });

  it("runs one immediate reconciliation scan when the gated runtime starts", async () => {
    const module = await importReconcilerModule();
    const createPublicCatalogV2Reconciler = readFunction(
      module,
      "createPublicCatalogV2Reconciler"
    ) as (options: ReconcilerOptions) => {
      runOnce(): Promise<Record<string, unknown>>;
      start(): void;
      stop(): Promise<void>;
    };
    const repository = createReconcilerRepositoryFake();
    const reconciler = createPublicCatalogV2Reconciler({
      finalizer: vi.fn(async () => ({ status: "succeeded" })),
      now: fixedNow,
      repository,
      runIntervalMs: 60_000,
      workerId: "web00-opv2-reconciler-01"
    });

    reconciler.start();
    await Promise.resolve();
    await reconciler.stop();

    expect(repository.findPostActivationFinalizationGaps).toHaveBeenCalledTimes(1);
  });

  it("uses concrete repository methods for post-activation gaps and one finalization transaction", async () => {
    const module = await importRepositoryModule();
    const createPublicCatalogV2Repository = readFunction(
      module,
      "createPublicCatalogV2Repository"
    ) as (prisma: ReturnType<typeof createRecoveryPrismaFake>) => {
      finalizePublicationTransaction(input: Record<string, unknown>): Promise<PublicationOperationRecord>;
      findPostActivationFinalizationGaps(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    };
    const prisma = createRecoveryPrismaFake();
    const repository = createPublicCatalogV2Repository(prisma);

    const gaps = await repository.findPostActivationFinalizationGaps({
      now: fixedNow(),
      staleLockedBefore: new Date("2026-08-03T18:03:00.000Z"),
      workerId: "web00-opv2-reconciler-01"
    });
    await expect(repository.finalizePublicationTransaction({
      activePointerSha256: "e".repeat(64),
      action: "publish",
      completedAt: fixedNow(),
      eventType: "activate",
      expectedPublicState: "published",
      leaseId: "synthetic-lease-001",
      operationId: "00000000-0000-4000-8000-00000000feed",
      previousRevision: null,
      requestId: "req_recovery",
      revision: 7,
      siteId: "00000000-0000-4000-8000-000000000101"
    })).resolves.toMatchObject({
      leaseId: null,
      status: "succeeded"
    });

    expect(gaps).toEqual([
      expect.objectContaining({
        activePointer: activePointerFixture(),
        operation: expect.objectContaining({
          id: "00000000-0000-4000-8000-00000000feed",
          stage: "db_finalize",
          status: "running"
        }),
        release: expect.objectContaining({
          activationInput: expect.objectContaining({
            manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
            manifestSha256: "c".repeat(64),
            revision: 7
          })
        })
      })
    ]);
    expect(prisma.publicCatalogRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activePointerSha256: "e".repeat(64),
        status: "active"
      }),
      where: { revision: 7 }
    }));
    expect(prisma.publicCatalogSetting.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { activeRevision: 7 },
      where: { id: "public-catalog" }
    }));
    expect(prisma.publicCatalogActivationEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activePointerSha256: "e".repeat(64),
        eventType: "activate",
        operationId: "00000000-0000-4000-8000-00000000feed",
        revision: 7
      })
    }));
    expect(prisma.site.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        publishedAt: fixedNow(),
        status: "published"
      }),
      where: expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000101"
      })
    }));
    expect(prisma.publicCatalogPublicationOperation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        stage: "db_finalize",
        status: "succeeded"
      }),
      where: {
        id: "00000000-0000-4000-8000-00000000feed",
        leaseId: "synthetic-lease-001",
        status: "running"
      }
    }));
  });

  it("executes DB finalization writes inside one Prisma transaction and rolls back failed activation evidence", async () => {
    const module = await importRepositoryModule();
    const createPublicCatalogV2Repository = readFunction(
      module,
      "createPublicCatalogV2Repository"
    ) as (prisma: ReturnType<typeof createTransactionalRecoveryPrismaFake>) => {
      finalizePublicationTransaction(input: Record<string, unknown>): Promise<PublicationOperationRecord>;
    };
    const successPrisma = createTransactionalRecoveryPrismaFake();
    const repository = createPublicCatalogV2Repository(successPrisma);

    await expect(repository.finalizePublicationTransaction(finalizeTransactionInput())).resolves.toMatchObject({
      status: "succeeded"
    });
    expect(successPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(successPrisma.rootWrites).toEqual([]);
    expect(successPrisma.state).toMatchObject({
      activePointerSha256: "e".repeat(64),
      activeRevision: 7,
      operationStatus: "succeeded",
      releaseStatus: "active",
      siteStatus: "published"
    });

    const failedPrisma = createTransactionalRecoveryPrismaFake({
      failActivationEvent: true
    });
    const failedRepository = createPublicCatalogV2Repository(failedPrisma);

    await expect(failedRepository.finalizePublicationTransaction(finalizeTransactionInput())).rejects.toThrow(
      "Synthetic activation event failure."
    );
    expect(failedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(failedPrisma.state).toMatchObject({
      activePointerSha256: null,
      activeRevision: 6,
      operationStatus: "running",
      releaseStatus: "verified",
      siteStatus: "draft"
    });
  });

  it("rolls back DB finalization when the target site row is not finalized", async () => {
    const module = await importRepositoryModule();
    const createPublicCatalogV2Repository = readFunction(
      module,
      "createPublicCatalogV2Repository"
    ) as (prisma: ReturnType<typeof createTransactionalRecoveryPrismaFake>) => {
      finalizePublicationTransaction(input: Record<string, unknown>): Promise<PublicationOperationRecord>;
    };
    const prisma = createTransactionalRecoveryPrismaFake({ siteUpdateCount: 0 });
    const repository = createPublicCatalogV2Repository(prisma);

    await expect(repository.finalizePublicationTransaction(finalizeTransactionInput())).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_V2_DB_FINALIZATION_FAILED"
    });
    expect(prisma.state).toMatchObject({
      activePointerSha256: null,
      activeRevision: 6,
      operationStatus: "running",
      releaseStatus: "verified",
      siteStatus: "draft"
    });
  });
});

interface FinalizePublicationSuccessInput {
  activePointer: Record<string, unknown>;
  dependencies: ReturnType<typeof createPublicationFinalizerDependenciesFake>;
  leaseId: string;
  now: () => Date;
  operation: PublicationOperationRecord;
  release: Record<string, unknown>;
}

interface ReconcilerOptions {
  finalizer: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  now: () => Date;
  repository: ReturnType<typeof createReconcilerRepositoryFake>;
  runIntervalMs?: number;
  workerId: string;
}

async function importPublicationModule(): Promise<Record<string, unknown>> {
  try {
    return await import(publicationModulePath);
  } catch (error) {
    throw new Error("Expected durable publication finalizer module to exist for OPV2-5.", { cause: error });
  }
}

async function importReconcilerModule(): Promise<Record<string, unknown>> {
  try {
    return await import(reconcilerModulePath);
  } catch (error) {
    throw new Error("Expected public catalog V2 reconciler module to exist for OPV2-5.", { cause: error });
  }
}

async function importRepositoryModule(): Promise<Record<string, unknown>> {
  try {
    return await import(repositoryModulePath);
  } catch (error) {
    throw new Error("Expected public catalog V2 repository module to exist for OPV2-5 recovery.", { cause: error });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected recovery export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

function createPublicationFinalizerDependenciesFake(overrides: Record<string, unknown> = {}) {
  const callOrder: string[] = [];
  const dependencies = {
    callOrder,
    assertPublicCardParity: vi.fn(async () => {
      callOrder.push("public_card_parity");
      return { matched: true };
    }),
    finalizePublicationTransaction: vi.fn(async () => {
      callOrder.push("finalize_transaction");
      return { status: "succeeded" };
    }),
    readActivePointer: vi.fn(async () => {
      callOrder.push("active_pointer_read_back");
      return activePointerFixture();
    }),
    readDbContentState: vi.fn(async () => {
      callOrder.push("db_content_state");
      return {
        siteId: "00000000-0000-4000-8000-000000000101",
        status: "published"
      };
    }),
    readImmutableRelease: vi.fn(async () => {
      callOrder.push("immutable_release_read_back");
      return immutableReleaseReadBackFixture();
    }),
    ...overrides
  };

  return dependencies;
}

function createReconcilerRepositoryFake() {
  return {
    findPostActivationFinalizationGaps: vi.fn(async () => [
      {
        activePointer: activePointerFixture(),
        leaseId: "synthetic-lease-001",
        operation: operationRecord({ status: "running" }),
        release: releaseFixture()
      }
    ])
  };
}

function createRecoveryPrismaFake() {
  const operation = operationRecord({ stage: "db_finalize", status: "running" });

  return {
    publicCatalogActivationEvent: {
      create: vi.fn(async () => ({}))
    },
    publicCatalogPublicationOperation: {
      create: vi.fn(async () => operationRecord()),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [operation]),
      findUnique: vi.fn(async () => operation),
      update: vi.fn(async () => operationRecord()),
      updateMany: vi.fn(async (args: { data: Partial<PublicationOperationRecord> }) => {
        Object.assign(operation, args.data);

        return { count: 1 };
      })
    },
    publicCatalogRelease: {
      findUnique: vi.fn(async () => releaseRecord()),
      update: vi.fn(async () => releaseRecord())
    },
    publicCatalogSetting: {
      update: vi.fn(async () => ({ activeRevision: 7, id: "public-catalog" }))
    },
    site: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 1 }))
    }
  };
}

function finalizeTransactionInput(): Record<string, unknown> {
  return {
    activePointerSha256: "e".repeat(64),
    action: "publish",
    completedAt: fixedNow(),
    eventType: "activate",
    expectedPublicState: "published",
    leaseId: "synthetic-lease-001",
    operationId: "00000000-0000-4000-8000-00000000feed",
    previousRevision: null,
    requestId: "req_recovery",
    revision: 7,
    siteId: "00000000-0000-4000-8000-000000000101"
  };
}

function createTransactionalRecoveryPrismaFake(options: {
  failActivationEvent?: boolean;
  siteUpdateCount?: number;
} = {}) {
  const operation = operationRecord({ stage: "db_finalize", status: "running" });
  const state = {
    activePointerSha256: null as string | null,
    activeRevision: 6,
    activationEvents: [] as Record<string, unknown>[],
    operationStatus: "running",
    releaseStatus: "verified",
    siteStatus: "draft"
  };
  const rootWrites: string[] = [];
  const outsideTransaction = (name: string) => {
    rootWrites.push(name);
    throw new Error(`Unexpected non-transactional finalization write: ${name}`);
  };
  const tx = {
    publicCatalogActivationEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (options.failActivationEvent === true) {
          throw new Error("Synthetic activation event failure.");
        }
        state.activationEvents.push(args.data);

        return {};
      })
    },
    publicCatalogPublicationOperation: {
      create: vi.fn(async () => operationRecord()),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => operation),
      update: vi.fn(async () => operationRecord()),
      updateMany: vi.fn(async (args: { data: Partial<PublicationOperationRecord> }) => {
        Object.assign(operation, args.data);
        state.operationStatus = String(args.data.status ?? state.operationStatus);

        return { count: 1 };
      })
    },
    publicCatalogRelease: {
      findUnique: vi.fn(async () => releaseRecord()),
      update: vi.fn(async (args: { data: { activePointerSha256?: string; status?: string } }) => {
        state.activePointerSha256 = args.data.activePointerSha256 ?? state.activePointerSha256;
        state.releaseStatus = args.data.status ?? state.releaseStatus;

        return releaseRecord();
      })
    },
    publicCatalogSetting: {
      update: vi.fn(async (args: { data: { activeRevision?: number } }) => {
        state.activeRevision = args.data.activeRevision ?? state.activeRevision;

        return { activeRevision: state.activeRevision, id: "public-catalog" };
      })
    },
    site: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async (args: { data: { status?: string } }) => {
        const count = options.siteUpdateCount ?? 1;
        if (count === 1) {
          state.siteStatus = args.data.status ?? state.siteStatus;
        }

        return { count };
      })
    }
  };

  return {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<PublicationOperationRecord>) => {
      const snapshot = {
        activePointerSha256: state.activePointerSha256,
        activeRevision: state.activeRevision,
        activationEvents: [...state.activationEvents],
        operationStatus: state.operationStatus,
        releaseStatus: state.releaseStatus,
        siteStatus: state.siteStatus
      };
      try {
        return await callback(tx);
      } catch (error) {
        state.activePointerSha256 = snapshot.activePointerSha256;
        state.activeRevision = snapshot.activeRevision;
        state.activationEvents = snapshot.activationEvents;
        state.operationStatus = snapshot.operationStatus;
        state.releaseStatus = snapshot.releaseStatus;
        state.siteStatus = snapshot.siteStatus;
        throw error;
      }
    }),
    publicCatalogActivationEvent: {
      create: vi.fn(async () => outsideTransaction("activationEvent.create"))
    },
    publicCatalogPublicationOperation: {
      create: vi.fn(async () => operationRecord()),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => operation),
      update: vi.fn(async () => operationRecord()),
      updateMany: vi.fn(async () => outsideTransaction("publicationOperation.updateMany"))
    },
    publicCatalogRelease: {
      findUnique: vi.fn(async () => releaseRecord()),
      update: vi.fn(async () => outsideTransaction("release.update"))
    },
    publicCatalogSetting: {
      update: vi.fn(async () => outsideTransaction("setting.update"))
    },
    rootWrites,
    site: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => outsideTransaction("site.updateMany"))
    },
    state
  };
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
    leaseId: "synthetic-lease-001",
    lockedAt: now,
    lockedBy: "web00-opv2-worker-01",
    nextRetryAt: null,
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "req_recovery",
    retryCount: 0,
    siteId: "00000000-0000-4000-8000-000000000101",
    stage: "active_verify",
    status: "running",
    targetRevision: 7,
    trigger: "site_publication",
    updatedAt: now,
    ...overrides
  };
}

function releaseFixture(): Record<string, unknown> {
  return {
    activationInput: {
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "c".repeat(64),
      revision: 7
    },
    manifest: {
      artifacts: [
        {
          kind: "index",
          path: "public-catalog/v2/releases/revision-7/index.json",
          sha256: "1".repeat(64)
        }
      ],
      chunks: [
        {
          path: "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json",
          sha256: "2".repeat(64)
        }
      ],
      index: {
        path: "public-catalog/v2/releases/revision-7/index.json",
        sha256: "1".repeat(64)
      },
      itemsCount: 1,
      revision: 7,
      sha256: "c".repeat(64)
    }
  };
}

function activePointerFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
    manifestSha256: "c".repeat(64),
    path: "public-catalog/v2/active.json",
    revision: 7,
    sha256: "e".repeat(64),
    ...overrides
  };
}

function releaseRecord() {
  return {
    activePointerSha256: "e".repeat(64),
    activatedAt: fixedNow(),
    categoriesPath: "public-catalog/v2/releases/revision-7/categories.json",
    categoriesSha256: "f".repeat(64),
    chunksCount: 1,
    generatedAt: fixedNow(),
    indexPath: "public-catalog/v2/releases/revision-7/index.json",
    indexSha256: "1".repeat(64),
    itemsCount: 1,
    manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
    manifestSha256: "c".repeat(64),
    popularCount: 1,
    popularPath: "public-catalog/v2/releases/revision-7/popular.json",
    popularSha256: "a".repeat(64),
    revision: 7,
    status: "active"
  };
}

function immutableReleaseReadBackFixture(): Record<string, unknown> {
  const release = releaseFixture();
  const manifest = release.manifest as Record<string, unknown>;

  return {
    artifacts: manifest.artifacts,
    chunks: manifest.chunks,
    index: manifest.index,
    itemsCount: 1,
    manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
    manifestSha256: "c".repeat(64),
    revision: 7,
    sha256: "c".repeat(64)
  };
}

function fixedNow(): Date {
  return new Date("2026-08-03T18:04:00.000Z");
}
