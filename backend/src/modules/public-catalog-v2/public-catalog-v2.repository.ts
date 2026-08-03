import {
  PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES,
  PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES,
  type ClaimPublicationOperationInput,
  type CreatePublicationOperationInput,
  type FinalizePublicationOperationInput,
  type PublicationCheckpointInput,
  type PublicationOperationRecord,
  type PublicCatalogV2ProjectionCursor,
  type PublicCatalogV2ProjectionPage,
  type PublicCatalogV2ProjectionRecord,
  type PublicCatalogV2Repository,
  type RecordActivationEventInput
} from "./public-catalog-v2.types.js";

const DEFAULT_OPERATION_STAGE = "content_transaction";
const DEFAULT_OPERATION_STATUS = "queued";

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
    findMany(args: unknown): Promise<PublicCatalogV2ProjectionRecord[]>;
  };
}

export class PublicCatalogV2RepositoryError extends Error {
  constructor(readonly code: "IDEMPOTENCY_KEY_REUSED" | "PUBLIC_CATALOG_V2_INVALID_TERMINAL_STATUS") {
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
  const operation = await prisma.publicCatalogPublicationOperation.findFirst({
    orderBy: { createdAt: "asc" },
    where: buildClaimWhere(input.staleLockedBefore ?? null)
  });

  if (operation === null) {
    return null;
  }

  const claimWhere = buildClaimWhere(input.staleLockedBefore ?? null);
  const claim = await prisma.publicCatalogPublicationOperation.updateMany({
    data: {
      leaseId: input.leaseId,
      lockedAt: input.now,
      lockedBy: input.lockedBy,
      status: "running",
      updatedAt: input.now
    },
    where: {
      id: operation.id,
      ...claimWhere
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
  return prisma.publicCatalogPublicationOperation.update({
    data: {
      lastCheckpoint: input.lastCheckpoint,
      lastErrorCode: input.lastErrorCode ?? null,
      ...(input.retryCount === undefined ? {} : { retryCount: input.retryCount }),
      stage: input.stage
    },
    where: { id: input.operationId }
  });
}

async function finalizePublicationOperation(
  prisma: PublicCatalogV2PrismaClient,
  input: FinalizePublicationOperationInput
): Promise<PublicationOperationRecord> {
  if (!PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES.includes(input.status)) {
    throw new PublicCatalogV2RepositoryError("PUBLIC_CATALOG_V2_INVALID_TERMINAL_STATUS");
  }

  return prisma.publicCatalogPublicationOperation.update({
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
    where: { id: input.operationId }
  });
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
    const items = await prisma.site.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
        { slug: "asc" },
        { id: "asc" }
      ],
      take: input.take,
      where: {
        active: true,
        deletedAt: null,
        status: "published",
        ...buildProjectionCursorWhere(afterCursor)
      }
    });

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

function buildClaimWhere(staleLockedBefore: Date | null): Record<string, unknown> {
  const claimableStatuses: Record<string, unknown>[] = [
    { status: "queued" },
    { status: "retry_wait" }
  ];

  if (staleLockedBefore !== null) {
    claimableStatuses.push({
      lockedAt: { lte: staleLockedBefore },
      status: "running"
    });
  }

  return { OR: claimableStatuses };
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
