import type { ImagePipelineSemaphore } from "./image.types.js";

export function createImagePipelineSemaphore(maxActive: 4): ImagePipelineSemaphore;
export function createImagePipelineSemaphore(maxActive: number): ImagePipelineSemaphore;
export function createImagePipelineSemaphore(maxActive: number): ImagePipelineSemaphore {
  if (!Number.isInteger(maxActive) || maxActive <= 0) {
    throw new Error("maxActive must be a positive integer.");
  }

  const queue: Array<() => void> = [];
  let active = 0;

  async function acquire(): Promise<void> {
    if (active < maxActive) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  }

  function release(): void {
    active -= 1;
    const next = queue.shift();

    if (next !== undefined) {
      next();
    }
  }

  return {
    async run(operation) {
      await acquire();

      try {
        return await operation();
      } finally {
        release();
      }
    }
  };
}
