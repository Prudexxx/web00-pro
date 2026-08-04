import type { StorageConfig } from "../../config/storage-env.js";
import {
  PUBLIC_CATALOG_V2_JSON_BUCKET,
  assertPublicCatalogV2Bucket,
  assertPublicCatalogV2StoragePath
} from "./public-catalog-v2.paths.js";
import type {
  PublicCatalogV2FetchedArtifact,
  PublicCatalogV2Storage,
  PublicCatalogV2UploadInput
} from "./public-catalog-v2.storage.js";

type FetchLike = (
  input: string | URL,
  init?: {
    body?: string;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
    signal?: AbortSignal;
  }
) => Promise<{
  headers: {
    get(name: string): string | null;
  };
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const JSON_CONTENT_TYPE = "application/json";

export function createPublicCatalogV2SupabaseStorage(
  config: StorageConfig,
  options: {
    fetchImpl?: FetchLike;
  } = {}
): PublicCatalogV2Storage {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    throw storageUnavailable();
  }

  return {
    async fetchJsonArtifact(input): Promise<PublicCatalogV2FetchedArtifact> {
      assertJsonBucketAndPath(input.bucketId, input.path);
      const response = await fetchImpl(buildPublicObjectUrl(config, input.path), {
        method: "GET",
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });

      if (!response.ok) {
        throw storageUnavailable();
      }

      return {
        body: await response.text(),
        bucketId: input.bucketId,
        contentType: readContentType(response.headers.get("content-type")),
        path: input.path
      };
    },

    getPublicUrl(path) {
      assertPublicCatalogV2StoragePath(path);
      return buildPublicObjectUrl(config, path);
    },

    uploadActivePointer(input) {
      assertUpload(input, { upsert: true });
      return uploadJson(config, input, fetchImpl);
    },

    uploadImmutableJsonArtifact(input) {
      assertUpload(input, { upsert: false });
      return uploadJson(config, input, fetchImpl);
    }
  };
}

async function uploadJson(
  config: StorageConfig,
  input: PublicCatalogV2UploadInput,
  fetchImpl: FetchLike
): Promise<void> {
  const response = await fetchImpl(buildUploadObjectUrl(config, input.path), {
    body: input.body,
    headers: {
      apikey: config.credentials.serviceRoleKey,
      authorization: `Bearer ${config.credentials.serviceRoleKey}`,
      "cache-control": input.cacheControl,
      "content-type": input.contentType,
      "x-upsert": input.upsert ? "true" : "false"
    },
    method: "POST",
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });

  if (!response.ok) {
    throw storageUnavailable();
  }
}

function assertUpload(
  input: PublicCatalogV2UploadInput,
  expected: {
    upsert: boolean;
  }
): void {
  assertJsonBucketAndPath(input.bucketId, input.path);
  if (
    input.contentType !== JSON_CONTENT_TYPE ||
    input.upsert !== expected.upsert ||
    input.cacheControl.length === 0
  ) {
    throw storageUnavailable();
  }
}

function assertJsonBucketAndPath(bucketId: string, path: string): void {
  assertPublicCatalogV2Bucket(bucketId);
  assertPublicCatalogV2StoragePath(path);
}

function buildUploadObjectUrl(config: StorageConfig, path: string): string {
  const url = new URL(config.credentials.supabaseUrl);
  url.pathname = `/storage/v1/object/${PUBLIC_CATALOG_V2_JSON_BUCKET}/${path}`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

function buildPublicObjectUrl(config: StorageConfig, path: string): string {
  const url = new URL(config.publicBaseUrl);
  url.pathname = `/storage/v1/object/public/${PUBLIC_CATALOG_V2_JSON_BUCKET}/${path}`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

function readContentType(value: string | null): string {
  return value?.split(";")[0]?.trim() || JSON_CONTENT_TYPE;
}

function storageUnavailable(): Error {
  return new Error("PUBLIC_CATALOG_V2_STORAGE_UNAVAILABLE");
}
