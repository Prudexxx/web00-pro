import { AppError } from "../../lib/errors.js";
import type { Clock } from "../images/image.types.js";
import type { ImageStorage } from "../images/image-storage.js";
import type {
  StorageCleanupJobRecord,
  StorageCleanupRepository,
  StorageCleanupTickResult,
  StorageCleanupWorker
} from "./storage-cleanup.types.js";

export const STORAGE_CLEANUP_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000
] as const;

export function createStorageCleanupWorker(options: {
  clock: Clock;
  pollIntervalMs?: number;
  repository: StorageCleanupRepository;
  storage: ImageStorage;
}): StorageCleanupWorker {
  let timer: NodeJS.Timeout | undefined;
  let runningTick: Promise<StorageCleanupTickResult> | undefined;

  async function tick(): Promise<StorageCleanupTickResult> {
    if (runningTick !== undefined) {
      return runningTick;
    }

    runningTick = runTick(options).finally(() => {
      runningTick = undefined;
    });

    return runningTick;
  }

  return {
    start() {
      if (timer !== undefined) {
        return;
      }

      timer = setInterval(() => {
        void tick();
      }, options.pollIntervalMs ?? 60_000);
    },
    async stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }

      await runningTick;
    },
    tick
  };
}

async function runTick(options: {
  clock: Clock;
  repository: StorageCleanupRepository;
  storage: ImageStorage;
}): Promise<StorageCleanupTickResult> {
  const now = options.clock.now();
  const staleBefore = new Date(now.getTime() - 15 * 60_000);
  const recovered = await options.repository.recoverStaleProcessing({
    olderThan: staleBefore
  });
  const jobs = await options.repository.claimDueJobs({ limit: 20, now });
  const counters = { completed: 0, failed: 0 };

  await runWithConcurrency(jobs, 2, async (job) => {
    const result = await processJob(options, job, now);

    counters.completed += result.completed;
    counters.failed += result.failed;
  });

  return {
    claimed: jobs.length,
    completed: counters.completed,
    failed: counters.failed,
    recovered
  };
}

async function processJob(
  options: {
    repository: StorageCleanupRepository;
    storage: ImageStorage;
  },
  job: StorageCleanupJobRecord,
  now: Date
): Promise<{ completed: number; failed: number }> {
  try {
    await options.storage.removeObjects([job.storagePath]);
    await options.repository.markCompleted({
      completedAt: now,
      id: job.id
    });

    return { completed: 1, failed: 0 };
  } catch (error) {
    if (error instanceof AppError && error.code === "IMAGE_NOT_FOUND") {
      await options.repository.markCompleted({
        completedAt: now,
        id: job.id
      });

      return { completed: 1, failed: 0 };
    }

    await options.repository.markFailed({
      id: job.id,
      lastError: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      nextRunAfter: nextRunAfter(job.attempts, now)
    });

    return { completed: 0, failed: 1 };
  }
}

function nextRunAfter(attempts: number, now: Date): Date | null {
  const delay = STORAGE_CLEANUP_BACKOFF_MS[attempts];

  if (delay === undefined) {
    return null;
  }

  return new Date(now.getTime() + delay);
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;

      if (item !== undefined) {
        await operation(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
}
