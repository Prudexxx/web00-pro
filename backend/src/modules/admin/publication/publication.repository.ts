import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import { PublicCatalogV2RepositoryError } from "../../public-catalog-v2/public-catalog-v2.repository.js";
import { PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES } from "../../public-catalog-v2/public-catalog-v2.types.js";
import type { PublicationOperationRecord } from "../../public-catalog-v2/public-catalog-v2.types.js";
import { siteNotFound } from "../sites/site.service.js";
import type {
  AdminPublicationRepository,
  AdminPublicationStartInput
} from "./publication.service.js";

const PUBLIC_CATALOG_SETTING_ID = "public-catalog";
const PUBLICATION_OPERATION_GROUP_KEY = "public-catalog";
const PUBLICATION_TRIGGER = "site_publication";
const COALESCING_CUTOFF_STAGES = new Set([
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
  "db_finalize",
  "reconcile"
]);

export function createPrismaAdminPublicationRepository(options: {
  prisma: PrismaClient;
}): AdminPublicationRepository {
  return {
    getOperation(id) {
      return options.prisma.publicCatalogPublicationOperation.findUnique({
        where: { id }
      });
    },

    startPublication(input) {
      return options.prisma.$transaction((tx) => startPublicationTransaction(tx, input));
    }
  };
}

async function startPublicationTransaction(
  tx: Prisma.TransactionClient,
  input: AdminPublicationStartInput
): Promise<PublicationOperationRecord> {
  const site = await tx.site.findFirst({
    select: { id: true },
    where: {
      deletedAt: null,
      id: input.siteId
    }
  });

  if (site === null) {
    throw siteNotFound();
  }

  const existingOperation = await tx.publicCatalogPublicationOperation.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existingOperation !== null) {
    if (existingOperation.requestFingerprint !== input.requestFingerprint) {
      throw new PublicCatalogV2RepositoryError("IDEMPOTENCY_KEY_REUSED");
    }

    return existingOperation;
  }

  const settings = await tx.publicCatalogSetting.upsert({
    create: {
      activeRevision: 0,
      autoPublish: true,
      desiredRevision: 1,
      id: PUBLIC_CATALOG_SETTING_ID,
      showDemoInModal: true
    },
    update: {
      updatedAt: input.now
    },
    where: { id: PUBLIC_CATALOG_SETTING_ID }
  });
  const activeOperation = await tx.publicCatalogPublicationOperation.findFirst({
    orderBy: { createdAt: "asc" },
    where: {
      operationGroupKey: PUBLICATION_OPERATION_GROUP_KEY,
      status: { in: [...PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES] }
    }
  });

  if (activeOperation !== null) {
    throwActivePublicationConflict(activeOperation);
  }

  const targetRevision =
    Math.max(settings.activeRevision, settings.desiredRevision) + 1;

  await tx.publicCatalogSetting.update({
    data: {
      desiredRevision: targetRevision
    },
    where: { id: PUBLIC_CATALOG_SETTING_ID }
  });

  const operation = await createPublicationOperation(tx, {
    ...input,
    targetRevision
  });
  await writePublicationAudit(tx, input, operation);

  return operation;
}

async function createPublicationOperation(
  tx: Prisma.TransactionClient,
  input: AdminPublicationStartInput & { targetRevision: number }
): Promise<PublicationOperationRecord> {
  try {
    return await tx.publicCatalogPublicationOperation.create({
      data: {
        action: input.action,
        actorUserId: input.actor.id,
        idempotencyKey: input.idempotencyKey,
        operationGroupKey: PUBLICATION_OPERATION_GROUP_KEY,
        operationScope: `site:${input.siteId}`,
        projectionHash: null,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        siteId: input.siteId,
        stage: "content_transaction",
        status: "queued",
        targetRevision: input.targetRevision,
        trigger: PUBLICATION_TRIGGER
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const replay = await tx.publicCatalogPublicationOperation.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (replay !== null) {
      if (replay.requestFingerprint !== input.requestFingerprint) {
        throw new PublicCatalogV2RepositoryError("IDEMPOTENCY_KEY_REUSED");
      }

      return replay;
    }

    throwActivePublicationConflict();
  }
}

async function writePublicationAudit(
  tx: Prisma.TransactionClient,
  input: AdminPublicationStartInput,
  operation: PublicationOperationRecord
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: `public_catalog_v2.${input.action}`,
      actorUserId: input.actor.id,
      afterJson: {
        action: input.action,
        operationId: operation.id,
        targetRevision: operation.targetRevision
      } satisfies Prisma.InputJsonObject,
      beforeJson: Prisma.DbNull,
      entityId: null,
      entityType: "public_catalog",
      ipHash: null,
      requestId: input.requestId,
      userAgentHash: null
    }
  });
}

function throwActivePublicationConflict(operation?: PublicationOperationRecord): never {
  throw new AppError({
    code: "PUBLIC_CATALOG_SYNC_CONFLICT",
    message: operation !== undefined && COALESCING_CUTOFF_STAGES.has(operation.stage)
      ? "Publication operation is already building. Retry after the current operation finishes."
      : "Publication operation is already queued or running. Retry after the current operation finishes.",
    statusCode: 409
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
