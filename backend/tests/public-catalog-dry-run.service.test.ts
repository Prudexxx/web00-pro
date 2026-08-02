import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import type { BuiltPublicCatalogSnapshot } from "../src/modules/public-catalog/public-catalog.snapshot.js";
import {
  createDefaultPublicCatalogControlState,
  PUBLIC_CATALOG_CONTROL_ID,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  createPrismaPublicCatalogDryRunRepository
} from "../src/modules/public-catalog/public-catalog-dry-run.repository.js";
import {
  createPublicCatalogDryRunService,
  type PublicCatalogDryRunServiceOptions
} from "../src/modules/public-catalog/public-catalog-dry-run.service.js";
import type { PublicCatalogReadOnlyTx } from "../src/modules/public-catalog/public-catalog-readonly-transaction.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";
import { createProjectionRecord } from "./public-catalog-snapshot-preparation.test.js";

const compileTimeStorageDependencyRejected = {
  logger: { log: vi.fn() },
  now: () => new Date("2026-08-02T04:00:00.000Z"),
  prepareSnapshotCandidate: vi.fn(async () => ({
    built: createBuiltSnapshotFixture(),
    byteLength: 1200,
    itemsCount: 1,
    revision: 1,
    status: "ready" as const
  })),
  prisma: {} as PrismaClient,
  repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
  runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture()),
  // @ts-expect-error dry-run service must not accept a Storage dependency.
  storage: { uploadJson: vi.fn() }
} satisfies PublicCatalogDryRunServiceOptions;
void compileTimeStorageDependencyRejected;

describe("public catalog dry-run service", () => {
  it("creates dry-run repository inside read-only transaction callback", async () => {
    const tx = createReadOnlyTxFixture();
    const repositoryFactory = vi.fn(({ tx: scopedTx }) =>
      createPrismaPublicCatalogDryRunRepository({ tx: scopedTx })
    );
    const service = createPublicCatalogDryRunService({
      logger: { log: vi.fn() },
      now: () => new Date("2026-08-02T04:00:00.000Z"),
      prepareSnapshotCandidate: vi.fn(async () => ({
        built: createBuiltSnapshotFixture(),
        byteLength: 1200,
        itemsCount: 1,
        revision: 1,
        status: "ready" as const
      })),
      prisma: {} as PrismaClient,
      repositoryFactory,
      runReadOnlyTransaction: async (_prisma, operation) => operation(tx)
    });

    const result = await service.dryRun({ requestId: "req_dry_ready" });

    expect(repositoryFactory).toHaveBeenCalledWith({ tx });
    expect(result).toMatchObject({
      byteLength: 1200,
      itemsCount: 1,
      requestId: "req_dry_ready",
      revision: 1,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: "ready"
    });
    expect(JSON.stringify(result)).not.toContain("bytes");
    expect(JSON.stringify(result)).not.toContain("snapshot");
  });

  it("rejects concurrent dry-run and clears guard after completion or failure", async () => {
    const started = createDeferredValue<void>();
    const release = createDeferredValue<void>();
    const service = createPublicCatalogDryRunService({
      logger: { log: vi.fn() },
      now: () => new Date("2026-08-02T04:00:00.000Z"),
      prepareSnapshotCandidate: vi.fn(async () => {
        started.resolve();
        await release.promise;
        return {
          built: createBuiltSnapshotFixture(),
          byteLength: 1200,
          itemsCount: 1,
          revision: 1,
          status: "ready" as const
        };
      }),
      prisma: {} as PrismaClient,
      repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
      runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture())
    });

    const first = service.dryRun({ requestId: "req_first" });
    await started.promise;
    await expect(service.dryRun({ requestId: "req_second" })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS",
      statusCode: 409
    });
    release.resolve();
    await expect(first).resolves.toMatchObject({ status: "ready" });
    await expect(service.dryRun({ requestId: "req_third" })).resolves.toMatchObject({ status: "ready" });
  });

  it("returns blocked safe diagnostics without bytes or snapshot bodies", async () => {
    const logger = { log: vi.fn() };
    const service = createPublicCatalogDryRunService({
      logger,
      now: () => new Date("2026-08-02T04:00:00.000Z"),
      prepareSnapshotCandidate: vi.fn(async () => ({
        blockers: [
          {
            errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED" as const,
            fieldPath: "demoUrl",
            itemIndex: 0,
            reasonCode: "INVALID_URL_CREDENTIALS" as const,
            siteId: "site_1",
            slug: "dom-dlya-busi",
            stage: "item_validate" as const
          }
        ],
        blockersTruncated: false,
        byteLength: null,
        itemsCount: 1,
        revision: 2,
        sha256: null,
        status: "blocked" as const
      })),
      prisma: {} as PrismaClient,
      repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
      runReadOnlyTransaction: async (_prisma, operation) =>
        operation(createReadOnlyTxFixture({
          control: { desiredRevision: 3, publishedRevision: 1 }
        }))
    });

    const result = await service.dryRun({ requestId: "req_blocked" });

    expect(result).toMatchObject({
      byteLength: null,
      itemsCount: 1,
      requestId: "req_blocked",
      revision: 2,
      sha256: null,
      status: "blocked"
    });
    expect(JSON.stringify(result)).not.toMatch(/bytes|snapshot|postgres:\/\/|token|password|secret/i);
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({
      event: "public_catalog_dry_run_completed",
      requestId: "req_blocked",
      revision: 2,
      status: "blocked"
    }));
  });

  it("maps unexpected failures to safe dry-run failure and logs no secret payloads", async () => {
    const logger = { log: vi.fn() };
    const service = createPublicCatalogDryRunService({
      logger,
      now: () => new Date("2026-08-02T04:00:00.000Z"),
      prepareSnapshotCandidate: vi.fn(async () => {
        throw new Error("provider response postgres://user:pass@db token=secret");
      }),
      prisma: {} as PrismaClient,
      repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
      runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture())
    });

    await expect(service.dryRun({ requestId: "req_failed" })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_DRY_RUN_FAILED",
      statusCode: 500
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(/provider response|user:pass|token=secret|postgres:\/\//i);
  });

  it("keeps dry-run service options limited to read-only dependencies", () => {
    const options = createDryRunServiceOptionsFixture();

    expect(Object.keys(options).sort()).toEqual([
      "logger",
      "now",
      "prepareSnapshotCandidate",
      "prisma",
      "repositoryFactory",
      "runReadOnlyTransaction"
    ]);
  });
});

function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createReadOnlyTxFixture(input: {
  control?: Partial<PublicCatalogControlState> | null;
  records?: PublicSiteRecord[];
} = {}) {
  const control =
    input.control === null
      ? null
      : {
          ...createDefaultPublicCatalogControlState(),
          ...input.control
        };
  const records = input.records ?? [createProjectionRecord()];
  return {
    publicCatalogControl: {
      findUnique: vi.fn(async () => control)
    },
    site: {
      findMany: vi.fn(async () => records)
    }
  } satisfies PublicCatalogReadOnlyTx;
}

function createBuiltSnapshotFixture(): BuiltPublicCatalogSnapshot {
  return {
    bytes:
      "{\"generatedAt\":\"2026-08-02T04:00:00.000Z\",\"items\":[],\"itemsCount\":0,\"revision\":1,\"schemaVersion\":1,\"settings\":{\"showDemoInModal\":false}}\n",
    sha256: "d".repeat(64),
    snapshot: {
      generatedAt: "2026-08-02T04:00:00.000Z",
      items: [],
      itemsCount: 0,
      revision: 1,
      schemaVersion: 1,
      settings: { showDemoInModal: false }
    }
  };
}

function createDryRunServiceOptionsFixture(
  overrides: Partial<PublicCatalogDryRunServiceOptions> = {}
): PublicCatalogDryRunServiceOptions {
  return {
    logger: { log: vi.fn() },
    now: () => new Date("2026-08-02T04:00:00.000Z"),
    prepareSnapshotCandidate: vi.fn(async () => ({
      built: createBuiltSnapshotFixture(),
      byteLength: 1200,
      itemsCount: 1,
      revision: 1,
      status: "ready" as const
    })),
    prisma: {} as PrismaClient,
    repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
    runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture()),
    ...overrides
  };
}
