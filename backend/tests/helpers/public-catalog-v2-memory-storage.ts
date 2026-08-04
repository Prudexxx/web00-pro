import type {
  PublicCatalogV2FetchedArtifact,
  PublicCatalogV2Storage,
  PublicCatalogV2UploadInput
} from "../../src/modules/public-catalog-v2/public-catalog-v2.storage.js";

export interface MemoryPublicCatalogV2Storage extends PublicCatalogV2Storage {
  readonly activePointerWrites: number;
  readonly uploadOrder: readonly string[];
  get(path: string): PublicCatalogV2FetchedArtifact | null;
}

export function createMemoryPublicCatalogV2Storage(options: {
  failActiveUploads?: number;
  failManifestFetchesAfterActive?: number;
  onBeforeImmutableUpload?: () => Promise<void> | void;
  onBeforeActiveUpload?: () => Promise<void> | void;
} = {}): MemoryPublicCatalogV2Storage {
  const objects = new Map<string, PublicCatalogV2FetchedArtifact>();
  const uploadOrder: string[] = [];
  let activePointerWrites = 0;
  let remainingActiveUploadFailures = options.failActiveUploads ?? 0;
  let remainingManifestFetchAfterActiveFailures = options.failManifestFetchesAfterActive ?? 0;

  return {
    get activePointerWrites() {
      return activePointerWrites;
    },

    get uploadOrder() {
      return [...uploadOrder];
    },

    async fetchJsonArtifact(input) {
      assertNotAborted(input.signal);
      if (
        activePointerWrites > 0 &&
        remainingManifestFetchAfterActiveFailures > 0 &&
        input.path.endsWith("/manifest.json")
      ) {
        remainingManifestFetchAfterActiveFailures -= 1;
        throw new Error("SYNTHETIC_POST_ACTIVE_MANIFEST_FETCH_FAILED");
      }

      const found = objects.get(storageKey(input.bucketId, input.path));
      if (found === undefined) {
        throw new Error("SYNTHETIC_STORAGE_OBJECT_NOT_FOUND");
      }

      return { ...found };
    },

    get(path) {
      const found = [...objects.values()].find((object) => object.path === path);

      return found === undefined ? null : { ...found };
    },

    getPublicUrl(path) {
      return `https://storage.web00.invalid/storage/v1/object/public/web00-public-catalog/${path}`;
    },

    async uploadActivePointer(input) {
      assertNotAborted(input.signal);
      await options.onBeforeActiveUpload?.();
      assertNotAborted(input.signal);
      assertJsonUpload(input, { upsert: true });
      if (remainingActiveUploadFailures > 0) {
        remainingActiveUploadFailures -= 1;
        throw new Error("SYNTHETIC_ACTIVE_POINTER_UPLOAD_FAILED");
      }

      objects.set(storageKey(input.bucketId, input.path), toFetchedArtifact(input));
      activePointerWrites += 1;
      uploadOrder.push(input.path);
    },

    async uploadImmutableJsonArtifact(input) {
      await options.onBeforeImmutableUpload?.();
      assertJsonUpload(input, { upsert: false });
      const key = storageKey(input.bucketId, input.path);

      if (objects.has(key)) {
        throw new Error("SYNTHETIC_IMMUTABLE_CONFLICT");
      }

      objects.set(key, toFetchedArtifact(input));
      uploadOrder.push(input.path);
    }
  };
}

function assertJsonUpload(
  input: PublicCatalogV2UploadInput,
  expected: {
    upsert: boolean;
  }
): void {
  if (
    input.bucketId !== "web00-public-catalog" ||
    input.contentType !== "application/json" ||
    input.upsert !== expected.upsert ||
    input.body.length === 0
  ) {
    throw new Error("SYNTHETIC_STORAGE_CONTRACT_MISMATCH");
  }
}

function toFetchedArtifact(input: PublicCatalogV2UploadInput): PublicCatalogV2FetchedArtifact {
  return {
    body: input.body,
    bucketId: input.bucketId,
    contentType: input.contentType,
    path: input.path
  };
}

function storageKey(bucketId: string, path: string): string {
  return `${bucketId}/${path}`;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("SYNTHETIC_STORAGE_ABORTED");
  }
}
