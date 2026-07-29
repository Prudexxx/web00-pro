import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  CreateStorageCleanupJobInput,
  CreateUploadReservationInput,
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
    async createJobs(input) {
      for (const job of input) {
        await prisma.storageCleanupJob.create({
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
    },
    async createUploadReservations(input) {
      const created: StorageCleanupJobRecord[] = [];

      for (const path of input.paths) {
        const job = await prisma.storageCleanupJob.create({
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
