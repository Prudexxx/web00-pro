import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import type {
  MarkStorageCleanupJobCompletedInput,
  MarkStorageCleanupJobFailedInput,
  MarkUploadReservationsCompletedInput,
  RecoverStaleProcessingInput,
  StorageCleanupJobRecord,
  StorageCleanupRepository
} from "./storage-cleanup.types.js";

export function createPrismaStorageCleanupRepository(options: {
  prisma: PrismaClient;
}): StorageCleanupRepository {
  const prisma = options.prisma;

  return {
    async claimDueJobs(input) {
      const candidates = await prisma.storageCleanupJob.findMany({
        orderBy: [{ runAfter: "asc" }, { id: "asc" }],
        take: input.limit,
        where: {
          attempts: { lt: 5 },
          completedAt: null,
          runAfter: { lte: input.now },
          status: { in: ["pending", "failed"] }
        }
      });
      const claimed: StorageCleanupJobRecord[] = [];

      for (const candidate of candidates) {
        const updated = await prisma.storageCleanupJob.updateMany({
          data: { status: "processing" },
          where: {
            attempts: candidate.attempts,
            completedAt: null,
            id: candidate.id,
            runAfter: { lte: input.now },
            status: candidate.status
          }
        });

        if (updated.count === 1) {
          claimed.push(toRecord({ ...candidate, status: "processing" }));
        }
      }

      return claimed;
    },
    async createJobs(input, deadlineOptions) {
      await runWithOptionalDeadline(prisma, deadlineOptions, async (client) => {
        for (const job of input) {
          await client.storageCleanupJob.create({
            data: {
              entityId: job.entityId,
              entityType: job.entityType,
              reason: job.reason,
              runAfter: job.runAfter,
              status: "pending",
              storagePath: job.storagePath
            }
          });
        }
      });
    },
    async createUploadReservations(input, deadlineOptions) {
      const created: StorageCleanupJobRecord[] = [];

      await runWithOptionalDeadline(prisma, deadlineOptions, async (client) => {
        for (const path of input.paths) {
          const job = await client.storageCleanupJob.create({
            data: {
              entityId: input.entityId,
              entityType: "site_image",
              reason: "upload_reservation",
              runAfter: input.runAfter,
              status: "pending",
              storagePath: path
            }
          });

          created.push(toRecord(job));
        }
      });

      return created;
    },
    async markCompleted(input: MarkStorageCleanupJobCompletedInput) {
      await prisma.storageCleanupJob.update({
        data: {
          completedAt: input.completedAt,
          lastError: null,
          status: "completed"
        },
        where: { id: input.id }
      });
    },
    async markFailed(input: MarkStorageCleanupJobFailedInput) {
      await prisma.storageCleanupJob.update({
        data: {
          attempts: { increment: 1 },
          lastError: input.lastError,
          ...(input.nextRunAfter === null ? {} : { runAfter: input.nextRunAfter }),
          status: "failed"
        },
        where: { id: input.id }
      });
    },
    async markUploadReservationsCompleted(input: MarkUploadReservationsCompletedInput) {
      await prisma.storageCleanupJob.updateMany({
        data: {
          completedAt: input.completedAt,
          lastError: null,
          status: "completed"
        },
        where: {
          id: { in: input.reservationIds },
          reason: "upload_reservation"
        }
      });
    },
    async recoverStaleProcessing(input: RecoverStaleProcessingInput) {
      const result = await prisma.storageCleanupJob.updateMany({
        data: { status: "pending" },
        where: {
          completedAt: null,
          status: "processing",
          updatedAt: { lt: input.olderThan }
        }
      });

      return result.count;
    }
  };
}

async function runWithOptionalDeadline<T>(
  prisma: PrismaClient,
  options: { timeoutMs: number } | undefined,
  operation: (client: PrismaClient | Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (options === undefined) {
    return operation(prisma);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await setLocalStatementTimeout(tx, options.timeoutMs);

      return operation(tx);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: Math.min(options.timeoutMs, 10_000),
      timeout: options.timeoutMs
    });
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      throw databaseTemporary();
    }

    throw error;
  }
}

async function setLocalStatementTimeout(
  tx: Prisma.TransactionClient,
  timeoutMs: number
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`;
}

function isDatabaseTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : "";
  const meta = "meta" in error ? (error as { meta?: unknown }).meta : undefined;

  return (
    code === "P2028" ||
    code === "57014" ||
    /statement timeout|transaction.*timed out|timed out|timeout/i.test(message) ||
    (typeof meta === "object" &&
      meta !== null &&
      JSON.stringify(meta).includes("57014"))
  );
}

function databaseTemporary(): AppError {
  return new AppError({
    code: "DATABASE_TEMPORARY",
    message: "Database operation timed out.",
    statusCode: 503
  });
}

function toRecord(
  job: Awaited<ReturnType<PrismaClient["storageCleanupJob"]["create"]>>
): StorageCleanupJobRecord {
  return {
    attempts: job.attempts,
    completedAt: job.completedAt,
    entityId: job.entityId,
    entityType: job.entityType,
    id: job.id,
    lastError: job.lastError,
    reason: job.reason,
    runAfter: job.runAfter,
    status: job.status as StorageCleanupJobRecord["status"],
    storagePath: job.storagePath,
    updatedAt: job.updatedAt
  };
}
