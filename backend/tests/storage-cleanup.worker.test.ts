import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import type { ImageStorage } from "../src/modules/images/image-storage.js";
import {
  createStorageCleanupWorker,
  STORAGE_CLEANUP_BACKOFF_MS
} from "../src/modules/storage-cleanup/storage-cleanup.worker.js";
import type {
  StorageCleanupJobRecord,
  StorageCleanupRepository
} from "../src/modules/storage-cleanup/storage-cleanup.types.js";
import { runStorageCleanupCommand } from "../src/cli/storage-cleanup.command.js";
import type { InteractiveTerminal } from "../src/cli/cli.types.js";

const now = new Date("2026-07-26T00:00:00.000Z");

function job(overrides: Partial<StorageCleanupJobRecord> = {}): StorageCleanupJobRecord {
  return {
    attempts: 0,
    completedAt: null,
    entityId: "11111111-1111-4111-8111-111111111111",
    entityType: "site_image",
    id: "22222222-2222-4222-8222-222222222222",
    lastError: null,
    reason: "preview_delete",
    runAfter: now,
    status: "pending",
    storagePath:
      "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/480.webp",
    updatedAt: now,
    ...overrides
  };
}

function terminal(): InteractiveTerminal & { output: string[] } {
  const output: string[] = [];

  return {
    output,
    async close() {
      return undefined;
    },
    async confirmExact() {
      throw new Error("unused");
    },
    async promptSecret() {
      throw new Error("unused");
    },
    async promptVisible() {
      throw new Error("unused");
    },
    writeSafe(message) {
      output.push(message);
    }
  };
}

describe("StorageCleanupWorker", () => {
  it("claims up to 20 jobs, removes with concurrency 2, and marks successes", async () => {
    const activeCounts: number[] = [];
    let active = 0;
    const repository: StorageCleanupRepository = {
      claimDueJobs: vi.fn(async () => [job({ id: "a" }), job({ id: "b" }), job({ id: "c" })]),
      createJobs: vi.fn(),
      createUploadReservations: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markUploadReservationsCompleted: vi.fn(),
      recoverStaleProcessing: vi.fn(async () => 1)
    };
    const storage: ImageStorage = {
      createBucket: vi.fn(),
      getPublicUrl: vi.fn(),
      inspectBucket: vi.fn(),
      inspectObjects: vi.fn(),
      removeObjects: vi.fn(async () => {
        active += 1;
        activeCounts.push(active);
        await Promise.resolve();
        active -= 1;
        return { removedPaths: [] };
      }),
      uploadObject: vi.fn()
    };
    const worker = createStorageCleanupWorker({
      clock: { now: () => now },
      repository,
      storage
    });

    await expect(worker.tick()).resolves.toEqual({
      claimed: 3,
      completed: 3,
      failed: 0,
      recovered: 1
    });
    expect(repository.claimDueJobs).toHaveBeenCalledWith({ limit: 20, now });
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2);
    expect(repository.markCompleted).toHaveBeenCalledTimes(3);
  });

  it("treats not-found as success and marks failures with exact backoff", async () => {
    expect(STORAGE_CLEANUP_BACKOFF_MS).toEqual([
      60_000,
      5 * 60_000,
      30 * 60_000,
      2 * 60 * 60_000,
      12 * 60 * 60_000
    ]);

    const repository: StorageCleanupRepository = {
      claimDueJobs: vi.fn(async () => [
        job({ id: "not-found", storagePath: "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/not-found.webp" }),
        job({ attempts: 1, id: "fail" })
      ]),
      createJobs: vi.fn(),
      createUploadReservations: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markUploadReservationsCompleted: vi.fn(),
      recoverStaleProcessing: vi.fn(async () => 0)
    };
    const storage: ImageStorage = {
      createBucket: vi.fn(),
      getPublicUrl: vi.fn(),
      inspectBucket: vi.fn(),
      inspectObjects: vi.fn(),
      removeObjects: vi.fn(async (paths) => {
        if (paths[0]?.includes("not-found")) {
          throw new AppError({
            code: "IMAGE_NOT_FOUND",
            message: "Image not found.",
            statusCode: 404
          });
        }

        throw new AppError({
          code: "STORAGE_UNAVAILABLE",
          message: "Storage unavailable.",
          statusCode: 503
        });
      }),
      uploadObject: vi.fn()
    };
    const worker = createStorageCleanupWorker({
      clock: { now: () => now },
      repository,
      storage
    });

    await expect(worker.tick()).resolves.toMatchObject({
      completed: 1,
      failed: 1
    });
    expect(repository.markCompleted).toHaveBeenCalledWith({
      completedAt: now,
      id: "not-found"
    });
    expect(repository.markFailed).toHaveBeenCalledWith({
      id: "fail",
      lastError: "STORAGE_UNAVAILABLE",
      nextRunAfter: new Date(now.getTime() + 5 * 60_000)
    });
  });
});

describe("runStorageCleanupCommand", () => {
  it("runs one bounded worker tick and writes safe output", async () => {
    const term = terminal();
    const worker = {
      start: vi.fn(),
      stop: vi.fn(),
      tick: vi.fn(async () => ({
        claimed: 1,
        completed: 1,
        failed: 0,
        recovered: 0
      }))
    };

    await expect(
      runStorageCleanupCommand({ terminal: term, worker })
    ).resolves.toBe(0);
    expect(worker.tick).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(term.output)).toContain("storage_cleanup_tick");
    expect(JSON.stringify(term.output)).not.toContain("service-role");
  });
});
