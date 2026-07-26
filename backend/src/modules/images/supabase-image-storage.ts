import { createClient } from "@supabase/supabase-js";
import type { StorageConfig } from "../../config/storage-env.js";
import { createImageAppError } from "./image.errors.js";
import type {
  ImageStorage,
  StorageBucketConfig,
  StorageBucketInspection,
  StorageBucketResult,
  StorageObjectInspection,
  StorageRemoveResult,
  StorageUploadResult,
  UploadImageObjectInput
} from "./image-storage.js";

export interface SupabaseStorageLike {
  storage: {
    createBucket?: (
      bucket: string,
      options: {
        allowedMimeTypes: string[];
        fileSizeLimit: number;
        public: boolean;
      }
    ) => Promise<{ data: unknown; error: unknown }>;
    from(bucket: string): {
      getPublicUrl?: (path: string) => { data: { publicUrl: string } };
      list?: (
        prefix: string
      ) => Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
      remove?: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
      upload?: (
        path: string,
        body: Buffer,
        options: {
          cacheControl: "31536000";
          contentType: "image/avif" | "image/webp";
          upsert: false;
        }
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    getBucket?: (bucket: string) => Promise<{ data: unknown; error: unknown }>;
  };
}

const variantPathPattern =
  /^sites\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(preview|gallery)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9]\d*)\.(webp|avif)$/;

export function createSupabaseImageStorage(
  config: StorageConfig,
  client: SupabaseStorageLike = createClient(
    config.credentials.supabaseUrl,
    config.credentials.serviceRoleKey,
    {
      auth: {
        persistSession: false
      }
    }
  ) as SupabaseStorageLike
): ImageStorage {
  return {
    async createBucket(input) {
      assertBucketConfig(input, config.bucket);
      const createBucket = client.storage.createBucket;

      if (createBucket === undefined) {
        throw storageConfigurationInvalid();
      }

      const result = await createBucket(input.id, {
        allowedMimeTypes: [...input.allowedMimeTypes],
        fileSizeLimit: input.fileSizeLimit,
        public: input.public
      });

      if (result.error !== null) {
        throw storageConfigurationInvalid();
      }

      return { created: true };
    },
    getPublicUrl(path) {
      assertVariantPath(path);

      const publicUrl = client.storage.from(config.bucket).getPublicUrl?.(path).data
        .publicUrl ?? deterministicPublicUrl(config, path);

      assertSafePublicUrl(config, publicUrl, path);
      return publicUrl;
    },
    async inspectBucket(bucket) {
      if (bucket !== config.bucket) {
        throw storageConfigurationInvalid();
      }

      const getBucket = client.storage.getBucket;

      if (getBucket === undefined) {
        return {
          compatible: true,
          exists: true
        };
      }

      const result = await getBucket(bucket);

      if (result.error !== null) {
        return { exists: false };
      }

      return {
        compatible: isCompatibleBucket(result.data),
        exists: true
      };
    },
    async inspectObjects(paths) {
      if (paths.length === 0) {
        return { existingPaths: [], missingPaths: [] };
      }

      const prefix = commonCanonicalPrefix(paths);
      const list = client.storage.from(config.bucket).list;

      if (list === undefined) {
        throw storageConfigurationInvalid();
      }

      const result = await list(prefix);

      if (result.error !== null || result.data === null) {
        throw createImageAppError(
          "STORAGE_UNAVAILABLE",
          "Storage is unavailable.",
          503
        );
      }

      const names = new Set(result.data.map((item) => item.name));
      const existingPaths: string[] = [];
      const missingPaths: string[] = [];

      for (const path of paths) {
        const name = path.slice(prefix.length + 1);

        if (names.has(name)) {
          existingPaths.push(path);
        } else {
          missingPaths.push(path);
        }
      }

      return { existingPaths, missingPaths };
    },
    async removeObjects(paths) {
      for (const path of paths) {
        assertVariantPath(path);
      }

      const remove = client.storage.from(config.bucket).remove;

      if (remove === undefined) {
        throw storageConfigurationInvalid();
      }

      const result = await remove([...paths]);

      if (result.error !== null) {
        throw createImageAppError(
          "STORAGE_UNAVAILABLE",
          "Storage is unavailable.",
          503
        );
      }

      return { removedPaths: [...paths] };
    },
    async uploadObject(input) {
      assertUploadInput(input);
      const upload = client.storage.from(config.bucket).upload;

      if (upload === undefined) {
        throw storageConfigurationInvalid();
      }

      const result = await upload(input.path, input.body, {
        cacheControl: input.cacheControl,
        contentType: input.contentType,
        upsert: false
      });

      if (result.error !== null) {
        throw createImageAppError(
          "STORAGE_WRITE_FAILED",
          "Storage write failed.",
          503
        );
      }

      return {
        path: input.path,
        publicUrl: this.getPublicUrl(input.path)
      } satisfies StorageUploadResult;
    }
  };
}

function assertUploadInput(input: UploadImageObjectInput): void {
  assertVariantPath(input.path);

  if (
    input.cacheControl !== "31536000" ||
    input.upsert !== false ||
    (input.contentType !== "image/webp" && input.contentType !== "image/avif")
  ) {
    throw storageConfigurationInvalid();
  }
}

function assertVariantPath(path: string): void {
  if (!variantPathPattern.test(path)) {
    throw storageConfigurationInvalid();
  }
}

function commonCanonicalPrefix(paths: readonly string[]): string {
  let prefix: string | undefined;

  for (const path of paths) {
    assertVariantPath(path);
    const nextPrefix = path.slice(0, path.lastIndexOf("/"));

    if (prefix === undefined) {
      prefix = nextPrefix;
      continue;
    }
    if (prefix !== nextPrefix) {
      throw storageConfigurationInvalid();
    }
  }

  if (prefix === undefined) {
    throw storageConfigurationInvalid();
  }

  return prefix;
}

function deterministicPublicUrl(config: StorageConfig, path: string): string {
  return `${new URL(config.publicBaseUrl).origin}/storage/v1/object/public/${config.bucket}/${path}`;
}

function assertSafePublicUrl(
  config: StorageConfig,
  publicUrl: string,
  path: string
): void {
  let url: URL;

  try {
    url = new URL(publicUrl);
  } catch {
    throw storageConfigurationInvalid();
  }

  const expected = new URL(deterministicPublicUrl(config, path));

  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw storageConfigurationInvalid();
  }
}

function assertBucketConfig(
  input: StorageBucketConfig,
  bucket: "web00-catalog-images"
): void {
  if (
    input.id !== bucket ||
    input.public !== true ||
    input.fileSizeLimit !== 5 * 1024 * 1024 ||
    input.allowedMimeTypes[0] !== "image/webp" ||
    input.allowedMimeTypes[1] !== "image/avif"
  ) {
    throw storageConfigurationInvalid();
  }
}

function isCompatibleBucket(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return true;
  }

  const record = data as Record<string, unknown>;
  const publicValue = record.public;
  const fileSizeLimit = record.file_size_limit ?? record.fileSizeLimit;
  const allowedMimeTypes = record.allowed_mime_types ?? record.allowedMimeTypes;

  return (
    (publicValue === undefined || publicValue === true) &&
    (fileSizeLimit === undefined || fileSizeLimit === 5 * 1024 * 1024) &&
    (allowedMimeTypes === undefined ||
      (Array.isArray(allowedMimeTypes) &&
        allowedMimeTypes.includes("image/webp") &&
        allowedMimeTypes.includes("image/avif")))
  );
}

function storageConfigurationInvalid(): ReturnType<typeof createImageAppError> {
  return createImageAppError(
    "STORAGE_CONFIGURATION_INVALID",
    "Storage configuration is invalid.",
    503
  );
}
