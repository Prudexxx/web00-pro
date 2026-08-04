import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  assertPublicCatalogV2ReadBackParity,
  buildPublicCatalogV2Release
} from "./public-catalog-v2.builder.js";
import { finalizePublicationSuccess } from "./public-catalog-v2.publication.js";
import { createPublicCatalogV2Orchestrator, type PublicCatalogV2OrchestratorRunResult } from "./public-catalog-v2.orchestrator.js";
import { PUBLIC_CATALOG_V2_JSON_BUCKET } from "./public-catalog-v2.paths.js";
import { createPublicCatalogV2Reconciler, type PublicCatalogV2ReconcilerRunResult } from "./public-catalog-v2.reconciler.js";
import {
  createPublicCatalogV2Repository,
  type PublicCatalogV2PrismaClient
} from "./public-catalog-v2.repository.js";
import { validatePublicCatalogV2ActivePointer, validatePublicCatalogV2Artifact } from "./public-catalog-v2.schemas.js";
import { sha256Hex } from "./public-catalog-v2.serializer.js";
import {
  uploadAndVerifyPublicCatalogV2ActivePointer,
  uploadAndVerifyPublicCatalogV2ImmutableArtifacts,
  uploadAndVerifyPublicCatalogV2Release,
  type PublicCatalogV2FetchedArtifact,
  type PublicCatalogV2Storage
} from "./public-catalog-v2.storage.js";
import type {
  PublicationOperationRecord,
  PublicCatalogV2MediaAsset,
  PublicCatalogV2ProjectionOperationIntent,
  PublicCatalogV2ProjectionRecord,
  PublicCatalogV2Repository,
  PublicCatalogV2Settings
} from "./public-catalog-v2.types.js";

const PUBLIC_CATALOG_SETTING_ID = "public-catalog";

export interface PublicCatalogV2Runtime {
  reconcileOnce(): Promise<PublicCatalogV2ReconcilerRunResult>;
  runOnce(): Promise<PublicCatalogV2OrchestratorRunResult>;
  start(): void;
  stop(): Promise<void>;
}

export interface CreatePublicCatalogV2RuntimeOptions {
  autoStartLoops?: boolean;
  enabled?: boolean;
  leaseId?: () => string;
  leaseTtlMs?: number;
  now?: () => Date;
  prisma: PrismaClient;
  reconcileIntervalMs?: number;
  reconcilerWorkerId?: string;
  runIntervalMs?: number;
  storage: PublicCatalogV2Storage;
  workerId?: string;
}

interface RuntimeCatalogState {
  previousRevision: number | null;
  settings: PublicCatalogV2Settings;
}

type RuntimeRepository = PublicCatalogV2Repository & {
  previousRevision: number | null;
  settings: PublicCatalogV2Settings;
};

export function createPublicCatalogV2Runtime(
  options: CreatePublicCatalogV2RuntimeOptions
): PublicCatalogV2Runtime {
  const enabled = options.enabled ?? false;
  const autoStartLoops = options.autoStartLoops ?? true;
  const now = options.now ?? (() => new Date());
  const repository = createPublicCatalogV2Repository(
    options.prisma as unknown as PublicCatalogV2PrismaClient
  );
  const runtimeState: RuntimeCatalogState = {
    previousRevision: null,
    settings: { showDemoInModal: true }
  };
  const runtimeRepository = createRuntimeRepository({
    prisma: options.prisma,
    repository,
    runtimeState
  });
  const finalizer = createPublicCatalogV2ReleaseFinalizer({
    now,
    repository,
    storage: options.storage
  });
  const orchestrator = createPublicCatalogV2Orchestrator({
    enabled,
    finalizer,
    ...(options.leaseId === undefined ? {} : { leaseId: options.leaseId }),
    ...(options.leaseTtlMs === undefined ? {} : { leaseTtlMs: options.leaseTtlMs }),
    now,
    releaseBuilder: async (input) => buildPublicCatalogV2Release(input) as unknown as Record<string, unknown>,
    releaseUploader: async (input) =>
      await uploadAndVerifyPublicCatalogV2ImmutableArtifacts({
        release: input.release as unknown as Parameters<typeof uploadAndVerifyPublicCatalogV2Release>[0]["release"],
        storage: options.storage
      }) as unknown as Record<string, unknown>,
    activePointerUploader: async (input) =>
      await uploadAndVerifyPublicCatalogV2ActivePointer({
        activatedAt: input.activatedAt,
        ...(input.onActivePointerUploaded === undefined
          ? {}
          : { onActivePointerUploaded: input.onActivePointerUploaded }),
        previousRevision: input.previousRevision,
        release: input.release as unknown as Parameters<typeof uploadAndVerifyPublicCatalogV2Release>[0]["release"],
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        storage: options.storage
      }) as unknown as Record<string, unknown>,
    repository: runtimeRepository,
    ...(options.runIntervalMs === undefined ? {} : { runIntervalMs: options.runIntervalMs }),
    ...(options.workerId === undefined ? {} : { workerId: options.workerId })
  });
  const reconciler = createPublicCatalogV2Reconciler({
    enabled,
    finalizer,
    ...(options.leaseTtlMs === undefined ? {} : { leaseTtlMs: options.leaseTtlMs }),
    now,
    repository,
    ...(options.reconcileIntervalMs === undefined ? {} : { runIntervalMs: options.reconcileIntervalMs }),
    ...(options.reconcilerWorkerId === undefined ? {} : { workerId: options.reconcilerWorkerId })
  });
  let started = false;

  return {
    reconcileOnce() {
      if (!enabled || !started) {
        return Promise.resolve({ failed: 0, reconciled: 0 });
      }

      return reconciler.runOnce();
    },

    runOnce() {
      if (!enabled || !started) {
        return Promise.resolve({
          claimed: false,
          reason: "disabled",
          status: "idle"
        });
      }

      return orchestrator.runOnce();
    },

    start() {
      if (!enabled || started) {
        return;
      }

      started = true;
      if (autoStartLoops) {
        orchestrator.start();
        reconciler.start();
      }
    },

    async stop() {
      if (!started) {
        return;
      }

      started = false;
      await Promise.all([
        orchestrator.stop(),
        reconciler.stop()
      ]);
    }
  };
}

export function createPublicCatalogV2ReleaseFinalizer(options: {
  now: () => Date;
  repository: PublicCatalogV2Repository;
  storage: PublicCatalogV2Storage;
}): (input: Record<string, unknown>) => Promise<Record<string, unknown>> {
  return async (input) => {
    const operation = readOperationRecord(input.operation);
    const repository = readRepository(input.repository) ?? options.repository;

    return await finalizePublicationSuccess({
      activePointer: readRecord(input.activePointer),
      dependencies: createFinalizerDependencies({
        operation,
        repository,
        storage: options.storage
      }),
      leaseId: readString(input.leaseId ?? operation.leaseId),
      now: options.now,
      operation,
      release: readRecord(input.release)
    }) as unknown as Record<string, unknown>;
  };
}

function readRepository(value: unknown): PublicCatalogV2Repository | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "finalizePublicationTransaction" in value &&
    "iteratePublicCatalogV2ProjectionPages" in value
  ) {
    return value as PublicCatalogV2Repository;
  }

  return null;
}

function createRuntimeRepository(input: {
  prisma: PrismaClient;
  repository: PublicCatalogV2Repository;
  runtimeState: RuntimeCatalogState;
}): RuntimeRepository {
  return {
    ...input.repository,
    get previousRevision() {
      return input.runtimeState.previousRevision;
    },
    get settings() {
      return input.runtimeState.settings;
    },
    async claimNextPublicationOperation(claimInput) {
      const operation = await input.repository.claimNextPublicationOperation(claimInput);
      if (operation !== null) {
        const settings = await input.prisma.publicCatalogSetting.findUnique({
          where: { id: PUBLIC_CATALOG_SETTING_ID }
        });
        input.runtimeState.previousRevision =
          settings !== null && settings.activeRevision > 0
            ? settings.activeRevision
            : null;
        input.runtimeState.settings = {
          showDemoInModal: settings?.showDemoInModal ?? true
        };
      }

      return operation;
    }
  };
}

function createFinalizerDependencies(input: {
  operation: PublicationOperationRecord;
  repository: PublicCatalogV2Repository;
  storage: PublicCatalogV2Storage;
}) {
  return {
    assertPublicCardParity: async (parityInput: Record<string, unknown>) => {
      assertRuntimePublicCardParity({
        dbContentState: readRecord(parityInput.dbContentState),
        expectedPresence: readString(parityInput.expectedPresence),
        immutableRelease: readRecord(parityInput.immutableRelease),
        operation: input.operation
      });
    },

    finalizePublicationTransaction: (finalizeInput: Record<string, unknown>) =>
      input.repository.finalizePublicationTransaction({
        activePointerSha256: readString(finalizeInput.activePointerSha256),
        action: readOperationAction(finalizeInput.action),
        completedAt: readDate(finalizeInput.completedAt),
        eventType: "activate",
        expectedPublicState: readExpectedPublicState(finalizeInput.expectedPublicState),
        leaseId: readString(finalizeInput.leaseId),
        operationId: readString(finalizeInput.operationId),
        previousRevision: readNullableNumber(finalizeInput.previousRevision),
        requestId: readString(finalizeInput.requestId),
        revision: readNumber(finalizeInput.revision),
        siteId: readNullableString(finalizeInput.siteId)
      }),

    readActivePointer: async (activeInput: Record<string, unknown>) => {
      const path = readString(activeInput.path);
      const fetched = await input.storage.fetchJsonArtifact({
        bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
        path
      });
      const parsed = validatePublicCatalogV2ActivePointer(JSON.parse(fetched.body));
      const revision = readNumber(parsed.activeRevision);

      return {
        manifestPath: readString(parsed.manifestPath),
        manifestSha256: readString(parsed.manifestSha256),
        path,
        previousRevision: readNullableNumber(parsed.previousRevision),
        revision,
        sha256: sha256Hex(fetched.body)
      };
    },

    readDbContentState: async () => {
      const items: PublicCatalogV2ProjectionRecord[] = [];

      for await (const page of input.repository.iteratePublicCatalogV2ProjectionPages({
        afterCursor: null,
        operation: readProjectionOperationIntent(input.operation),
        take: 100
      })) {
        items.push(...page.items);
      }

      return { items };
    },

    readImmutableRelease: async (immutableInput: Record<string, unknown>) =>
      readImmutableReleaseFromStorage({
        manifestPath: readString(immutableInput.manifestPath),
        storage: input.storage
      })
  };
}

async function readImmutableReleaseFromStorage(input: {
  manifestPath: string;
  storage: PublicCatalogV2Storage;
}): Promise<Record<string, unknown>> {
  const manifestFetched = await fetchAndValidateArtifact({
    kind: "manifest",
    path: input.manifestPath,
    storage: input.storage
  });
  const manifest = manifestFetched.parsed;
  const items: unknown[] = [];
  const artifacts = readArray(manifest.artifacts);

  for (const descriptor of artifacts) {
    const descriptorRecord = readRecord(descriptor);
    const kind = readArtifactKind(descriptorRecord.kind);
    const fetched = await fetchAndValidateArtifact({
      kind,
      path: readString(descriptorRecord.path),
      storage: input.storage
    });
    if (sha256Hex(fetched.body) !== readString(descriptorRecord.sha256)) {
      throw activePointerMismatch();
    }
    if (kind === "chunk") {
      items.push(...readArray(fetched.parsed.items));
    }
  }

  return {
    artifacts: manifest.artifacts,
    chunks: manifest.chunks,
    index: manifest.index,
    items,
    itemsCount: readNumber(manifest.itemsCount),
    manifestPath: input.manifestPath,
    manifestSha256: sha256Hex(manifestFetched.body),
    revision: readNumber(manifest.revision),
    sha256: sha256Hex(manifestFetched.body)
  };
}

async function fetchAndValidateArtifact(input: {
  kind: "categories" | "chunk" | "index" | "manifest" | "popular";
  path: string;
  storage: PublicCatalogV2Storage;
}): Promise<PublicCatalogV2FetchedArtifact & { parsed: Record<string, unknown> }> {
  const fetched = await input.storage.fetchJsonArtifact({
    bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
    path: input.path
  });
  const parsed = validatePublicCatalogV2Artifact(input.kind, JSON.parse(fetched.body));

  return {
    ...fetched,
    parsed
  };
}

function assertRuntimePublicCardParity(input: {
  dbContentState: Record<string, unknown>;
  expectedPresence: string;
  immutableRelease: Record<string, unknown>;
  operation: PublicationOperationRecord;
}): void {
  const siteId = input.operation.siteId;
  if (siteId === null) {
    return;
  }
  const dbItems = readArray(input.dbContentState.items);
  const releaseItems = readArray(input.immutableRelease.items);
  const dbItem = dbItems
    .map(readRecord)
    .find((item) => item.id === siteId);
  const slug = dbItem === undefined ? null : readString(dbItem.slug);
  const releaseItem = slug === null
    ? undefined
    : releaseItems.map(readRecord).find((item) => item.slug === slug);

  if (input.expectedPresence === "absent") {
    if (releaseItem !== undefined) {
      throw activePointerMismatch();
    }
    return;
  }

  if (dbItem === undefined || releaseItem === undefined) {
    throw activePointerMismatch();
  }

  assertMediaMatches(
    readNullableRecord(dbItem.previewImage),
    readNullableRecord(releaseItem.previewImage)
  );
  assertPublicCatalogV2ReadBackParity(
    readArray(dbItem.galleryImages).map((item) => readString(readRecord(item).assetId)),
    readArray(releaseItem.galleryImages).map((item) => readString(readRecord(item).assetId))
  );
  readArray(dbItem.galleryImages).forEach((dbGalleryItem, index) => {
    const releaseGalleryItem = readArray(releaseItem.galleryImages)[index];
    assertMediaMatches(readRecord(dbGalleryItem), readRecord(releaseGalleryItem));
  });
}

function assertMediaMatches(
  dbMedia: Record<string, unknown> | null,
  releaseMedia: Record<string, unknown> | null
): void {
  if (dbMedia === null || releaseMedia === null) {
    if (dbMedia !== releaseMedia) {
      throw activePointerMismatch();
    }
    return;
  }

  for (const field of ["assetId", "sourceSha256"] as const) {
    if (readString(dbMedia[field]) !== readString(releaseMedia[field])) {
      throw activePointerMismatch();
    }
  }
  for (const field of ["height", "width"] as const) {
    if (readNumber(dbMedia[field]) !== readNumber(releaseMedia[field])) {
      throw activePointerMismatch();
    }
  }
  if (!readString(releaseMedia.url).endsWith(`/${readString(dbMedia.storagePath)}`)) {
    throw activePointerMismatch();
  }

  const releaseVariants = readArray(releaseMedia.variants).map(readRecord);
  for (const dbVariant of readArray(dbMedia.variants).map(readRecord)) {
    const releaseVariant = releaseVariants.find((variant) => readNumber(variant.width) === readNumber(dbVariant.width));
    const variantPath = readNullableString(dbVariant.path);
    const variantFormat = readNullableString(dbVariant.format);

    if (releaseVariant === undefined || variantPath === null || variantFormat === null) {
      throw activePointerMismatch();
    }
    const urlField = variantFormat === "avif" ? "avifUrl" : "webpUrl";
    if (!readString(releaseVariant[urlField]).endsWith(`/${variantPath}`)) {
      throw activePointerMismatch();
    }
  }
}

function readProjectionOperationIntent(operation: PublicationOperationRecord): PublicCatalogV2ProjectionOperationIntent {
  return {
    action: readOperationAction(operation.action),
    siteId: operation.siteId
  };
}

function readOperationRecord(value: unknown): PublicationOperationRecord {
  const record = readRecord(value);

  return record as unknown as PublicationOperationRecord;
}

function readOperationAction(value: unknown): "publish" | "unpublish" | "settings_publish" | "reconcile" {
  if (value === "publish" || value === "unpublish" || value === "settings_publish" || value === "reconcile") {
    return value;
  }

  throw activePointerMismatch();
}

function readArtifactKind(value: unknown): "categories" | "chunk" | "index" | "manifest" | "popular" {
  if (value === "categories" || value === "chunk" || value === "index" || value === "manifest" || value === "popular") {
    return value;
  }

  throw activePointerMismatch();
}

function readExpectedPublicState(value: unknown): "published" | "unpublished" {
  if (value === "published" || value === "unpublished") {
    return value;
  }

  throw activePointerMismatch();
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readRecord(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw activePointerMismatch();
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw activePointerMismatch();
  }

  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw activePointerMismatch();
  }

  return value;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw activePointerMismatch();
  }

  return value;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readNumber(value);
}

function readDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  throw activePointerMismatch();
}

function activePointerMismatch(): Error {
  return Object.assign(new Error("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH"), {
    code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH"
  });
}
