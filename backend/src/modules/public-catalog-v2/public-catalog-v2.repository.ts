import {
  PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES,
  PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES,
  type ClaimPublicationOperationInput,
  type CreatePublicationOperationInput,
  type FinalizePublicationOperationInput,
  type PublicationCheckpointInput,
  type PublicationOperationRecord,
  type PublicCatalogV2ProjectionCursor,
  type PublicCatalogV2MediaAsset,
  type PublicCatalogV2ProjectionPage,
  type PublicCatalogV2ProjectionRecord,
  type PublicCatalogV2Repository,
  type RecordActivationEventInput
} from "./public-catalog-v2.types.js";
import { publicCategoryVisibilityWhere } from "../public-catalog/public-catalog.visibility.js";

const DEFAULT_OPERATION_STAGE = "content_transaction";
const DEFAULT_OPERATION_STATUS = "queued";

type ClaimQuery = {
  orderBy: Array<Record<string, "asc" | "desc">>;
  where: Record<string, unknown>;
};

export interface PublicCatalogV2PrismaClient {
  publicCatalogActivationEvent: {
    create(args: unknown): Promise<unknown>;
  };
  publicCatalogPublicationOperation: {
    create(args: unknown): Promise<PublicationOperationRecord>;
    findFirst(args: unknown): Promise<PublicationOperationRecord | null>;
    findUnique(args: unknown): Promise<PublicationOperationRecord | null>;
    update(args: unknown): Promise<PublicationOperationRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  site: {
    findMany(args: unknown): Promise<PublicCatalogV2PrismaProjectionSite[]>;
  };
}

interface PublicCatalogV2PrismaProjectionSite {
  active: boolean;
  category: {
    description: string | null;
    slug: string;
    sortOrder: number;
    title: string;
  };
  categoryId: string;
  createdAt: Date;
  deletedAt: Date | null;
  deliveryLabel: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  featured: boolean;
  features: string[];
  fullDescription: string | null;
  galleryImageAssets: Array<{
    alt: string;
    asset: PublicCatalogV2PrismaProjectionMediaAsset;
    sortOrder: number;
  }>;
  id: string;
  previewImage: {
    asset: PublicCatalogV2PrismaProjectionMediaAsset;
  } | null;
  priceLabel: string | null;
  publishedAt: Date | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  sortOrder: number;
  status: string;
  tags: string[];
  title: string;
  updatedAt: Date;
  views: number;
}

interface PublicCatalogV2PrismaProjectionMediaAsset {
  assetId: string;
  height: number;
  sourceSha256: string;
  storagePath: string;
  variants: unknown;
  width: number;
}

export class PublicCatalogV2RepositoryError extends Error {
  constructor(
    readonly code:
      | "IDEMPOTENCY_KEY_REUSED"
      | "PUBLIC_CATALOG_V2_INVALID_TERMINAL_STATUS"
      | "PUBLIC_CATALOG_V2_LEASE_NOT_HELD"
      | "PUBLIC_CATALOG_V2_INVALID_RETRY_SCHEDULE"
  ) {
    super(code);
    this.name = "PublicCatalogV2RepositoryError";
  }
}

export function createPublicCatalogV2Repository(prisma: PublicCatalogV2PrismaClient): PublicCatalogV2Repository {
  return {
    claimNextPublicationOperation: (input) => claimNextPublicationOperation(prisma, input),
    createOrCoalescePublicationOperation: (input) => createOrCoalescePublicationOperation(prisma, input),
    finalizePublicationOperation: (input) => finalizePublicationOperation(prisma, input),
    iteratePublicCatalogV2ProjectionPages: (input) => iteratePublicCatalogV2ProjectionPages(prisma, input),
    recordActivationEvent: (input) => recordActivationEvent(prisma, input),
    recordPublicationCheckpoint: (input) => recordPublicationCheckpoint(prisma, input)
  };
}

async function createOrCoalescePublicationOperation(
  prisma: PublicCatalogV2PrismaClient,
  input: CreatePublicationOperationInput
): Promise<PublicationOperationRecord> {
  const existingByKey = await findOperationByIdempotencyKey(prisma, input.idempotencyKey);

  if (existingByKey !== null) {
    assertMatchingFingerprint(existingByKey, input.requestFingerprint);
    return existingByKey;
  }

  const existingActiveGroup = await findActiveOperationByGroupKey(prisma, input.operationGroupKey);

  if (existingActiveGroup !== null) {
    return existingActiveGroup;
  }

  try {
    return await prisma.publicCatalogPublicationOperation.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey,
        operationGroupKey: input.operationGroupKey,
        operationScope: input.operationScope,
        projectionHash: input.projectionHash ?? null,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        siteId: input.siteId ?? null,
        stage: input.stage ?? DEFAULT_OPERATION_STAGE,
        status: DEFAULT_OPERATION_STATUS,
        targetRevision: input.targetRevision,
        trigger: input.trigger
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const replay = await findOperationByIdempotencyKey(prisma, input.idempotencyKey);
    if (replay !== null) {
      assertMatchingFingerprint(replay, input.requestFingerprint);
      return replay;
    }

    const coalesced = await findActiveOperationByGroupKey(prisma, input.operationGroupKey);
    if (coalesced !== null) {
      return coalesced;
    }

    throw error;
  }
}

async function claimNextPublicationOperation(
  prisma: PublicCatalogV2PrismaClient,
  input: ClaimPublicationOperationInput
): Promise<PublicationOperationRecord | null> {
  const claimCandidate = await findClaimCandidate(prisma, input);

  if (claimCandidate === null) {
    return null;
  }

  const { operation, where } = claimCandidate;
  const claim = await prisma.publicCatalogPublicationOperation.updateMany({
    data: {
      leaseId: input.leaseId,
      lockedAt: input.now,
      lockedBy: input.lockedBy,
      nextRetryAt: null,
      status: "running",
      updatedAt: input.now
    },
    where: {
      id: operation.id,
      ...where
    }
  });

  if (claim.count !== 1) {
    return null;
  }

  return prisma.publicCatalogPublicationOperation.findUnique({
    where: { id: operation.id }
  });
}

async function recordPublicationCheckpoint(
  prisma: PublicCatalogV2PrismaClient,
  input: PublicationCheckpointInput
): Promise<PublicationOperationRecord> {
  const status = input.status ?? "running";

  if (
    (status === "retry_wait" && input.nextRetryAt == null) ||
    (status === "running" && input.nextRetryAt !== undefined && input.nextRetryAt !== null)
  ) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_INVALID_RETRY_SCHEDULE");
  }

  const checkpoint = await prisma.publicCatalogPublicationOperation.updateMany({
    data: {
      lastCheckpoint: input.lastCheckpoint,
      lastErrorCode: input.lastErrorCode ?? null,
      ...(status === "retry_wait"
        ? {
            leaseId: null,
            lockedAt: null,
            lockedBy: null,
            nextRetryAt: input.nextRetryAt,
            status
          }
        : { status }),
      ...(input.retryCount === undefined ? {} : { retryCount: input.retryCount }),
      stage: input.stage
    },
    where: {
      id: input.operationId,
      leaseId: input.leaseId,
      status: "running"
    }
  });

  if (checkpoint.count !== 1) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_LEASE_NOT_HELD");
  }

  const updated = await prisma.publicCatalogPublicationOperation.findUnique({
    where: { id: input.operationId }
  });

  if (updated === null) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_LEASE_NOT_HELD");
  }

  return updated;
}

async function finalizePublicationOperation(
  prisma: PublicCatalogV2PrismaClient,
  input: FinalizePublicationOperationInput
): Promise<PublicationOperationRecord> {
  if (!PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES.includes(input.status)) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_INVALID_TERMINAL_STATUS");
  }

  const finalize = await prisma.publicCatalogPublicationOperation.updateMany({
    data: {
      completedAt: input.completedAt,
      lastCheckpoint: input.lastCheckpoint ?? {},
      lastErrorCode: input.lastErrorCode ?? null,
      leaseId: null,
      lockedAt: null,
      lockedBy: null,
      stage: input.stage,
      status: input.status
    },
    where: {
      id: input.operationId,
      leaseId: input.leaseId,
      status: "running"
    }
  });

  const finalized = await prisma.publicCatalogPublicationOperation.findUnique({
    where: { id: input.operationId }
  });

  if (finalized === null) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_LEASE_NOT_HELD");
  }

  if (finalize.count !== 1 && !isSameTerminalFinalization(finalized, input)) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_LEASE_NOT_HELD");
  }

  return finalized;
}

async function recordActivationEvent(
  prisma: PublicCatalogV2PrismaClient,
  input: RecordActivationEventInput
): Promise<void> {
  await prisma.publicCatalogActivationEvent.create({
    data: {
      activePointerSha256: input.activePointerSha256,
      eventType: input.eventType,
      operationId: input.operationId ?? null,
      previousRevision: input.previousRevision ?? null,
      requestId: input.requestId,
      revision: input.revision
    }
  });
}

async function* iteratePublicCatalogV2ProjectionPages(
  prisma: PublicCatalogV2PrismaClient,
  input: {
    afterCursor: PublicCatalogV2ProjectionCursor | null;
    take: 100;
  }
): AsyncIterable<PublicCatalogV2ProjectionPage> {
  let afterCursor = input.afterCursor;

  for (;;) {
    const rows = await prisma.site.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
        { slug: "asc" },
        { id: "asc" }
      ],
      select: {
        active: true,
        category: {
          select: {
            description: true,
            slug: true,
            sortOrder: true,
            title: true
          }
        },
        categoryId: true,
        createdAt: true,
        deletedAt: true,
        deliveryLabel: true,
        demoMode: true,
        demoUrl: true,
        featured: true,
        features: true,
        fullDescription: true,
        galleryImageAssets: {
          orderBy: [
            { sortOrder: "asc" },
            { assetId: "asc" }
          ],
          select: {
            alt: true,
            asset: {
              select: {
                assetId: true,
                height: true,
                sourceSha256: true,
                storagePath: true,
                variants: true,
                width: true
              }
            },
            sortOrder: true
          }
        },
        id: true,
        previewImage: {
          select: {
            asset: {
              select: {
                assetId: true,
                height: true,
                sourceSha256: true,
                storagePath: true,
                variants: true,
                width: true
              }
            }
          }
        },
        priceLabel: true,
        publishedAt: true,
        shortDescription: true,
        siteUrl: true,
        slug: true,
        sortOrder: true,
        status: true,
        tags: true,
        title: true,
        updatedAt: true,
        views: true
      },
      take: input.take,
      where: {
        active: true,
        category: publicCategoryVisibilityWhere(),
        deletedAt: null,
        status: "published",
        ...buildProjectionCursorWhere(afterCursor)
      }
    });
    const items = rows.map(toProjectionRecord);

    if (items.length === 0) {
      return;
    }

    const lastItem = items[items.length - 1]!;
    afterCursor = {
      createdAt: lastItem.createdAt,
      id: lastItem.id,
      slug: lastItem.slug,
      sortOrder: lastItem.sortOrder
    };

    yield {
      items,
      nextCursor: items.length < input.take ? null : afterCursor
    };

    if (items.length < input.take) {
      return;
    }
  }
}

function findOperationByIdempotencyKey(
  prisma: PublicCatalogV2PrismaClient,
  idempotencyKey: string
): Promise<PublicationOperationRecord | null> {
  return prisma.publicCatalogPublicationOperation.findUnique({
    where: { idempotencyKey }
  });
}

function findActiveOperationByGroupKey(
  prisma: PublicCatalogV2PrismaClient,
  operationGroupKey: string
): Promise<PublicationOperationRecord | null> {
  return prisma.publicCatalogPublicationOperation.findFirst({
    orderBy: { createdAt: "asc" },
    where: {
      operationGroupKey,
      status: { in: [...PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES] }
    }
  });
}

function assertMatchingFingerprint(operation: PublicationOperationRecord, requestFingerprint: string): void {
  if (operation.requestFingerprint !== requestFingerprint) {
    throw new PublicCatalogV2RepositoryError("IDEMPOTENCY_KEY_REUSED");
  }
}

function isSameTerminalFinalization(
  operation: PublicationOperationRecord,
  input: FinalizePublicationOperationInput
): boolean {
  return operation.completedAt !== null && operation.status === input.status;
}

async function findClaimCandidate(
  prisma: PublicCatalogV2PrismaClient,
  input: ClaimPublicationOperationInput
): Promise<{ operation: PublicationOperationRecord; where: Record<string, unknown> } | null> {
  for (const query of buildClaimQueries(input)) {
    const operation = await prisma.publicCatalogPublicationOperation.findFirst(query);

    if (operation !== null) {
      return {
        operation,
        where: query.where
      };
    }
  }

  return null;
}

function buildClaimQueries(input: ClaimPublicationOperationInput): ClaimQuery[] {
  const queries: ClaimQuery[] = [
    {
      orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
      where: { status: "queued" }
    },
    {
      orderBy: [{ nextRetryAt: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
      where: {
        nextRetryAt: { lte: input.now },
        status: "retry_wait"
      }
    }
  ];

  if (input.staleLockedBefore !== undefined && input.staleLockedBefore !== null) {
    queries.push({
      orderBy: [{ lockedAt: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
      where: {
        lockedAt: { lte: input.staleLockedBefore },
        status: "running"
      }
    });
  }

  return queries;
}

function buildProjectionCursorWhere(afterCursor: PublicCatalogV2ProjectionCursor | null): Record<string, unknown> {
  if (afterCursor === null) {
    return {};
  }

  return {
    OR: [
      { sortOrder: { gt: afterCursor.sortOrder } },
      {
        createdAt: { lt: afterCursor.createdAt },
        sortOrder: afterCursor.sortOrder
      },
      {
        createdAt: afterCursor.createdAt,
        slug: { gt: afterCursor.slug },
        sortOrder: afterCursor.sortOrder
      },
      {
        createdAt: afterCursor.createdAt,
        id: { gt: afterCursor.id },
        slug: afterCursor.slug,
        sortOrder: afterCursor.sortOrder
      }
    ]
  };
}

function toProjectionRecord(row: PublicCatalogV2PrismaProjectionSite): PublicCatalogV2ProjectionRecord {
  return {
    active: row.active,
    category: {
      description: row.category.description,
      slug: row.category.slug,
      sortOrder: row.category.sortOrder,
      title: row.category.title
    },
    categoryId: row.categoryId,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deliveryLabel: row.deliveryLabel,
    demoMode: row.demoMode,
    demoUrl: row.demoUrl,
    featured: row.featured,
    features: row.features,
    fullDescription: row.fullDescription,
    galleryImages: row.galleryImageAssets.map((image) => ({
      ...toProjectionMediaAsset(image.asset),
      alt: image.alt,
      sortOrder: image.sortOrder
    })),
    id: row.id,
    previewImage: row.previewImage === null ? null : toProjectionMediaAsset(row.previewImage.asset),
    priceLabel: row.priceLabel,
    publishedAt: row.publishedAt,
    shortDescription: row.shortDescription,
    siteUrl: row.siteUrl,
    slug: row.slug,
    sortOrder: row.sortOrder,
    status: row.status,
    tags: row.tags,
    title: row.title,
    updatedAt: row.updatedAt,
    views: row.views
  };
}

function toProjectionMediaAsset(asset: PublicCatalogV2PrismaProjectionMediaAsset): PublicCatalogV2MediaAsset {
  return {
    assetId: asset.assetId,
    height: asset.height,
    sourceSha256: asset.sourceSha256,
    storagePath: asset.storagePath,
    variants: readProjectionMediaVariants(asset.variants),
    width: asset.width
  };
}

function readProjectionMediaVariants(value: unknown): PublicCatalogV2MediaAsset["variants"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((variant) => {
    if (typeof variant !== "object" || variant === null || Array.isArray(variant)) {
      return { width: 0 };
    }
    const record = variant as Record<string, unknown>;
    const mapped: PublicCatalogV2MediaAsset["variants"][number] = {
      width: typeof record.width === "number" ? record.width : 0
    };
    if (record.format === "avif" || record.format === "webp") {
      mapped.format = record.format;
    }
    if (typeof record.path === "string") {
      mapped.path = record.path;
    }
    return mapped;
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
