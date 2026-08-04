import { describe, expect, it, vi } from "vitest";
import { PublicCatalogV2RepositoryError } from "../src/modules/public-catalog-v2/public-catalog-v2.repository.js";
import type { PublicationOperationRecord } from "../src/modules/public-catalog-v2/public-catalog-v2.types.js";

const publicationRepositoryModulePath = "../src/modules/admin/publication/publication.repository.js";

describe("admin publication repository", () => {
  it("replays an existing idempotency key without bumping desired revision or writing duplicate audit", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const existingOperation = operationRecord({ status: "succeeded", targetRevision: 7 });
    const prisma = createPrismaFake({
      existingOperation
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(repository.startPublication(startInput())).resolves.toMatchObject({
      id: existingOperation.id,
      status: "succeeded",
      targetRevision: 7
    });
    expect(prisma.tx.publicCatalogSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogSetting.update).not.toHaveBeenCalled();
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a changed fingerprint before desired revision or audit side effects", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const prisma = createPrismaFake({
      existingOperation: operationRecord({
        requestFingerprint: "a".repeat(64),
        status: "queued",
        targetRevision: 7
      })
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(
      repository.startPublication(startInput({ requestFingerprint: "b".repeat(64) }))
    ).rejects.toBeInstanceOf(PublicCatalogV2RepositoryError);
    await expect(
      repository.startPublication(startInput({ requestFingerprint: "b".repeat(64) }))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(prisma.tx.publicCatalogSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogSetting.update).not.toHaveBeenCalled();
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a new publication request after the active operation has passed projection cutoff", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const prisma = createPrismaFake({
      activeOperation: operationRecord({
        id: "00000000-0000-4000-8000-00000000b001",
        idempotencyKey: "00000000-0000-4000-8000-0000000000b1",
        requestFingerprint: "c".repeat(64),
        stage: "projection_page",
        status: "running",
        targetRevision: 7
      }),
      existingOperation: null
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(
      repository.startPublication(startInput({
        idempotencyKey: "00000000-0000-4000-8000-0000000000c1",
        requestFingerprint: "d".repeat(64)
      }))
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_SYNC_CONFLICT" });
    expect(prisma.tx.publicCatalogSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogSetting.update).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogPublicationOperation.create).not.toHaveBeenCalled();
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a new idempotency key while a catalog operation is already running before projection", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const runningOperation = operationRecord({
      id: "00000000-0000-4000-8000-00000000b101",
      idempotencyKey: "00000000-0000-4000-8000-0000000000b1",
      leaseId: "synthetic-lease",
      lockedAt: fixedNow(),
      lockedBy: "web00-opv2-worker-01",
      requestFingerprint: "c".repeat(64),
      stage: "content_transaction",
      status: "running",
      targetRevision: 7
    });
    const prisma = createPrismaFake({
      activeOperation: runningOperation,
      existingOperation: null
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(
      repository.startPublication(startInput({
        idempotencyKey: "00000000-0000-4000-8000-0000000000d1",
        requestFingerprint: "d".repeat(64)
      }))
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_SYNC_CONFLICT" });
    expect(prisma.tx.publicCatalogSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogSetting.update).not.toHaveBeenCalled();
    expect(prisma.tx.publicCatalogPublicationOperation.create).not.toHaveBeenCalled();
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not return another site's active catalog operation as the current POST result", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const otherSiteOperation = operationRecord({
      id: "00000000-0000-4000-8000-00000000b202",
      idempotencyKey: "00000000-0000-4000-8000-0000000000b2",
      operationScope: "site:00000000-0000-4000-8000-000000000202",
      requestFingerprint: "e".repeat(64),
      siteId: "00000000-0000-4000-8000-000000000202",
      stage: "content_transaction",
      status: "queued",
      targetRevision: 7
    });
    const prisma = createPrismaFake({
      activeOperation: otherSiteOperation,
      existingOperation: null
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(
      repository.startPublication(startInput({
        idempotencyKey: "00000000-0000-4000-8000-0000000000e1",
        requestFingerprint: "f".repeat(64),
        siteId: "00000000-0000-4000-8000-000000000101"
      }))
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_SYNC_CONFLICT" });
    expect(prisma.tx.publicCatalogPublicationOperation.create).not.toHaveBeenCalled();
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects when the catalog active-operation index races after the precheck", async () => {
    const module = await importPublicationRepositoryModule();
    const createPrismaAdminPublicationRepository = readFunction(
      module,
      "createPrismaAdminPublicationRepository"
    ) as (options: { prisma: ReturnType<typeof createPrismaFake> }) => {
      startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
    };
    const prisma = createPrismaFake({
      createOperationError: uniqueConstraintError(),
      existingOperation: null
    });
    const repository = createPrismaAdminPublicationRepository({ prisma });

    await expect(
      repository.startPublication(startInput({
        idempotencyKey: "00000000-0000-4000-8000-0000000000f1",
        requestFingerprint: "f".repeat(64)
      }))
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_SYNC_CONFLICT" });
    expect(prisma.tx.publicCatalogPublicationOperation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        operationGroupKey: "public-catalog"
      })
    }));
    expect(prisma.tx.publicCatalogPublicationOperation.create).toHaveBeenCalledTimes(1);
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

interface AdminPublicationStartInput {
  action: "publish" | "unpublish";
  actor: {
    id: string;
  };
  idempotencyKey: string;
  now: Date;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
}

async function importPublicationRepositoryModule(): Promise<Record<string, unknown>> {
  try {
    return await import(publicationRepositoryModulePath);
  } catch (error) {
    throw new Error("Expected admin publication repository module to exist for OPV2-5.", { cause: error });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected admin publication repository export ${name} to be a function.`);
  }

  return value as (...args: unknown[]) => unknown;
}

function createPrismaFake(options: {
  activeOperation?: PublicationOperationRecord | null;
  createOperationError?: unknown;
  existingOperation: PublicationOperationRecord | null;
}) {
  const tx = {
    auditLog: {
      create: vi.fn(async () => ({}))
    },
    publicCatalogPublicationOperation: {
      create: vi.fn(async () => {
        if (options.createOperationError !== undefined) {
          throw options.createOperationError;
        }

        return operationRecord();
      }),
      findFirst: vi.fn(async () => options.activeOperation ?? null),
      findUnique: vi.fn(async () => options.existingOperation),
      update: vi.fn(async () => operationRecord()),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    publicCatalogSetting: {
      update: vi.fn(async () => settingsRecord()),
      upsert: vi.fn(async () => settingsRecord())
    },
    site: {
      findFirst: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000101" }))
    }
  };

  return {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    tx
  };
}

function uniqueConstraintError(): Error & { code: string } {
  return Object.assign(new Error("Synthetic unique constraint."), { code: "P2002" });
}

function startInput(overrides: Partial<AdminPublicationStartInput> = {}): AdminPublicationStartInput {
  return {
    action: "publish",
    actor: {
      id: "00000000-0000-4000-8000-000000000001"
    },
    idempotencyKey: "00000000-0000-4000-8000-0000000000a7",
    now: fixedNow(),
    requestFingerprint: "a".repeat(64),
    requestId: "req_admin_publication_repository",
    siteId: "00000000-0000-4000-8000-000000000101",
    ...overrides
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
    leaseId: null,
    lockedAt: null,
    lockedBy: null,
    nextRetryAt: null,
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "req_existing_publication",
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

function settingsRecord() {
  return {
    activeRevision: 6,
    desiredRevision: 7,
    id: "public-catalog",
    showDemoInModal: true
  };
}

function fixedNow(): Date {
  return new Date("2026-08-03T18:05:00.000Z");
}
