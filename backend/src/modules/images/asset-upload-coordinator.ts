import type { AssetUploadCoordinator } from "./image.types.js";

export function createAssetUploadCoordinator(): AssetUploadCoordinator {
  const tails = new Map<string, Promise<void>>();

  return {
    async runExclusive(key, operation) {
      const previousTail = tails.get(key) ?? Promise.resolve();
      const runPromise = previousTail.then(operation);
      const tail = runPromise.then(
        () => undefined,
        () => undefined
      );

      tails.set(key, tail);

      try {
        return await runPromise;
      } finally {
        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      }
    }
  };
}
