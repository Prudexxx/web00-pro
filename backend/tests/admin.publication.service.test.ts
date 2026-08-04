import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import type {
  CreatePublicationOperationInput,
  PublicationOperationRecord,
  PublicCatalogV2Repository
} from "../src/modules/public-catalog-v2/public-catalog-v2.types.js";
import { PublicCatalogV2RepositoryError } from "../src/modules/public-catalog-v2/public-catalog-v2.repository.js";

const publicationModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.publication.js";

describe("durable publication operation service", () => {
  it("maps actual persisted operation status on idempotent replay without fabricating queued, running or published states", async () => {
    const module = await importPublicationModule();
    const createDurablePublicationOperationService = readFunction(
      module,
      "createDurablePublicationOperationService"
    ) as (options: {
      now: () => Date;
      repository: ReturnType<typeof createOperationRepositoryFake>;
    }) => {
      startPublication(input: DurablePublicationInput): Promise<Record<string, unknown>>;
    };
    const repository = createOperationRepositoryFake();
    const service = createDurablePublicationOperationService({ now: fixedNow, repository });
    const idempotencyKey = "00000000-0000-4000-8000-0000000000a7";
    const input = durablePublicationInput({ idempotencyKey, targetRevision: 7 });

    const first = await service.startPublication(input);
    repository.setPersistedStatus(idempotencyKey, "running");
    const afterClaimReplay = await service.startPublication(input);
    repository.setPersistedStatus(idempotencyKey, "retry_wait");
    const retryReplay = await service.startPublication(input);
    repository.setPersistedStatus(idempotencyKey, "succeeded");
    const successReplay = await service.startPublication(input);

    await expect(
      service.startPublication(durablePublicationInput({
        idempotencyKey,
        requestFingerprint: "b".repeat(64),
        targetRevision: 7
      }))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(first).toEqual({
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(afterClaimReplay).toMatchObject({
      buttonLabel: "Публикуется…",
      stableStatus: "Публикуется",
      status: "running",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(retryReplay).toMatchObject({
      buttonLabel: "Публикуется…",
      stableStatus: "Публикуется",
      status: "retry_wait"
    });
    expect(successReplay).toMatchObject({
      buttonLabel: "Опубликовано",
      retryable: false,
      stableStatus: "Опубликовано",
      status: "succeeded"
    });
    expect(repository.createOrCoalescePublicationOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: "publish",
      actorUserId: adminPrincipal().id,
      idempotencyKey,
      operationGroupKey: "public-catalog",
      operationScope: "site:00000000-0000-4000-8000-000000000101",
      requestFingerprint: "a".repeat(64),
      requestId: "req_publication_service",
      siteId: "00000000-0000-4000-8000-000000000101",
      stage: "content_transaction",
      targetRevision: 7,
      trigger: "site_publication"
    }));
    expect(JSON.stringify([first, afterClaimReplay, retryReplay, successReplay])).not.toMatch(
      /lease|lockedBy|lockedAt|requestFingerprint|manifest|bucket|sha256/i
    );
  });

  it("keeps unpublish progress stable and maps verified terminal success to the not-published state", async () => {
    const module = await importPublicationModule();
    const createDurablePublicationOperationService = readFunction(
      module,
      "createDurablePublicationOperationService"
    ) as (options: {
      now: () => Date;
      repository: ReturnType<typeof createOperationRepositoryFake>;
    }) => {
      startPublication(input: DurablePublicationInput): Promise<Record<string, unknown>>;
    };
    const repository = createOperationRepositoryFake();
    const service = createDurablePublicationOperationService({ now: fixedNow, repository });
    const idempotencyKey = "00000000-0000-4000-8000-0000000000b7";
    const input = durablePublicationInput({
      action: "unpublish",
      idempotencyKey,
      targetRevision: 8
    });

    const queued = await service.startPublication(input);
    repository.setPersistedStatus(idempotencyKey, "succeeded");
    const succeeded = await service.startPublication(input);

    expect(queued).toMatchObject({
      buttonLabel: "Публикуется…",
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(succeeded).toMatchObject({
      buttonLabel: "Опубликовать",
      retryable: false,
      stableStatus: "Не опубликовано",
      status: "succeeded"
    });
  });
});

interface DurablePublicationInput {
  action: "publish" | "unpublish";
  actor: AuthenticatedPrincipal;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
  targetRevision: number;
}

async function importPublicationModule(): Promise<Record<string, unknown>> {
  try {
    return await import(publicationModulePath);
  } catch (error) {
    throw new Error("Expected durable publication operation module to exist for OPV2-5.", { cause: error });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected durable publication export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

function createOperationRepositoryFake() {
  const rows = new Map<string, PublicationOperationRecord>();
  const repository = {
    claimNextPublicationOperation: vi.fn(),
    createOrCoalescePublicationOperation: vi.fn(async (input: CreatePublicationOperationInput) => {
      const existing = rows.get(input.idempotencyKey);
      if (existing !== undefined) {
        if (existing.requestFingerprint !== input.requestFingerprint) {
          throw new PublicCatalogV2RepositoryError("IDEMPOTENCY_KEY_REUSED");
        }
        return existing;
      }
      const operation = operationRecord({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey,
        operationGroupKey: input.operationGroupKey,
        operationScope: input.operationScope,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        siteId: input.siteId ?? null,
        stage: input.stage ?? "content_transaction",
        status: "queued",
        targetRevision: input.targetRevision,
        trigger: input.trigger
      });
      rows.set(input.idempotencyKey, operation);

      return operation;
    }),
    finalizePublicationOperation: vi.fn(),
    iteratePublicCatalogV2ProjectionPages: vi.fn(),
    recordActivationEvent: vi.fn(),
    recordPublicationCheckpoint: vi.fn(),
    setPersistedStatus(idempotencyKey: string, status: PublicationOperationRecord["status"]) {
      const row = rows.get(idempotencyKey);
      if (row === undefined) {
        throw new Error(`Missing synthetic operation ${idempotencyKey}`);
      }
      row.status = status;
      row.leaseId = status === "running" ? "synthetic-lease" : null;
      row.lockedAt = status === "running" ? fixedNow() : null;
      row.lockedBy = status === "running" ? "synthetic-worker" : null;
    }
  } satisfies Partial<PublicCatalogV2Repository> & {
    setPersistedStatus(idempotencyKey: string, status: PublicationOperationRecord["status"]): void;
  };

  return repository;
}

function durablePublicationInput(overrides: Partial<DurablePublicationInput> = {}): DurablePublicationInput {
  return {
    action: "publish",
    actor: adminPrincipal(),
    idempotencyKey: "00000000-0000-4000-8000-0000000000a7",
    requestFingerprint: "a".repeat(64),
    requestId: "req_publication_service",
    siteId: "00000000-0000-4000-8000-000000000101",
    targetRevision: 7,
    ...overrides
  };
}

function operationRecord(overrides: Partial<PublicationOperationRecord> = {}): PublicationOperationRecord {
  const now = fixedNow();

  return {
    action: "publish",
    actorUserId: null,
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
    requestId: "req_publication_service",
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

function fixedNow(): Date {
  return new Date("2026-08-03T18:00:00.000Z");
}

function adminPrincipal(): AuthenticatedPrincipal {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}
