import { AppError } from "../../lib/errors.js";
import type { ImagePipelineSemaphore } from "./image.types.js";

export interface ImagePipelineSemaphoreOptions {
  maxActive: number;
  maxQueued?: number;
  queueWaitTimeoutMs?: number;
}

interface QueuedOperation {
  readonly operation: () => Promise<unknown>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: unknown) => void;
  readonly signal?: AbortSignal | undefined;
  abortListener?: (() => void) | undefined;
  settled: boolean;
  timer?: NodeJS.Timeout | undefined;
}

interface NormalizedImagePipelineSemaphoreOptions {
  maxActive: number;
  maxQueued: number;
  queueWaitTimeoutMs?: number | undefined;
}

export function createImagePipelineSemaphore(maxActive?: number): ImagePipelineSemaphore;
export function createImagePipelineSemaphore(
  options?: ImagePipelineSemaphoreOptions
): ImagePipelineSemaphore;
export function createImagePipelineSemaphore(
  input: ImagePipelineSemaphoreOptions | number = 4
): ImagePipelineSemaphore {
  const options = normalizeOptions(input);
  const queue: QueuedOperation[] = [];
  let active = 0;

  async function runQueued<T>(queued: QueuedOperation): Promise<T> {
    try {
      return (await queued.operation()) as T;
    } finally {
      active -= 1;
      drain();
    }
  }

  function drain(): void {
    while (active < options.maxActive && queue.length > 0) {
      const next = queue.shift();

      if (next === undefined || next.settled) {
        continue;
      }

      clearQueuedOperation(next);
      if (next.signal?.aborted === true) {
        rejectQueuedOperation(next, clientAborted());
        continue;
      }

      active += 1;
      runQueued(next).then(next.resolve, next.reject);
      return;
    }
  }

  return {
    run<T>(
      operation: () => Promise<T>,
      runOptions: { signal?: AbortSignal | undefined } = {}
    ): Promise<T> {
      if (runOptions.signal?.aborted === true) {
        return Promise.reject(clientAborted());
      }

      if (active < options.maxActive) {
        active += 1;
        return runQueued({
          operation: operation as () => Promise<unknown>,
          reject: () => undefined,
          resolve: () => undefined,
          signal: runOptions.signal,
          settled: false
        }) as Promise<T>;
      }

      if (queue.length >= options.maxQueued) {
        return Promise.reject(processorBusy("Image processor queue is full."));
      }

      return new Promise<T>((resolve, reject) => {
        const queued: QueuedOperation = {
          operation: operation as () => Promise<unknown>,
          reject,
          resolve: resolve as (value: unknown) => void,
          signal: runOptions.signal,
          settled: false
        };

        if (options.queueWaitTimeoutMs !== undefined) {
          queued.timer = setTimeout(() => {
            rejectQueuedOperation(
              queued,
              processorBusy("Image processor queue wait timed out.")
            );
          }, options.queueWaitTimeoutMs);
        }

        if (runOptions.signal !== undefined) {
          queued.abortListener = () => {
            rejectQueuedOperation(queued, clientAborted());
          };
          runOptions.signal.addEventListener("abort", queued.abortListener, {
            once: true
          });
        }

        queue.push(queued);
      });
    },
    stats() {
      return {
        active,
        queued: queue.filter((queued) => !queued.settled).length
      };
    }
  };

  function rejectQueuedOperation(queued: QueuedOperation, error: AppError): void {
    if (queued.settled) {
      return;
    }

    queued.settled = true;
    const index = queue.indexOf(queued);
    if (index >= 0) {
      queue.splice(index, 1);
    }
    clearQueuedOperation(queued);
    queued.reject(error);
  }
}

function normalizeOptions(
  input: ImagePipelineSemaphoreOptions | number
): NormalizedImagePipelineSemaphoreOptions {
  const options = typeof input === "number" ? { maxActive: input } : input;
  const maxQueued = options.maxQueued ?? Number.POSITIVE_INFINITY;
  const queueWaitTimeoutMs = options.queueWaitTimeoutMs;

  if (!Number.isInteger(options.maxActive) || options.maxActive <= 0) {
    throw new Error("maxActive must be a positive integer.");
  }
  if (
    (maxQueued !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maxQueued) || maxQueued < 0)) ||
    (!Number.isFinite(maxQueued) && maxQueued !== Number.POSITIVE_INFINITY)
  ) {
    throw new Error("maxQueued must be a non-negative integer.");
  }
  if (
    queueWaitTimeoutMs !== undefined &&
    (!Number.isSafeInteger(queueWaitTimeoutMs) || queueWaitTimeoutMs <= 0)
  ) {
    throw new Error("queueWaitTimeoutMs must be a positive integer.");
  }

  return {
    maxActive: options.maxActive,
    maxQueued,
    queueWaitTimeoutMs
  };
}

function clearQueuedOperation(queued: QueuedOperation): void {
  if (queued.timer !== undefined) {
    clearTimeout(queued.timer);
    queued.timer = undefined;
  }
  if (queued.abortListener !== undefined && queued.signal !== undefined) {
    queued.signal.removeEventListener("abort", queued.abortListener);
    queued.abortListener = undefined;
  }
}

function processorBusy(message: string): AppError {
  return new AppError({
    code: "IMAGE_PROCESSOR_BUSY",
    message,
    statusCode: 503
  });
}

function clientAborted(): AppError {
  return new AppError({
    code: "CLIENT_ABORTED",
    message: "Image processing request was aborted.",
    statusCode: 499
  });
}
