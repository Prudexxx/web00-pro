export interface ImageStorageOperationContext {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs: number;
}

export interface UploadImageObjectInput {
  body: Buffer;
  cacheControl: "31536000";
  contentType: "image/avif" | "image/webp";
  context?: ImageStorageOperationContext | undefined;
  path: string;
  upsert: false;
}

export interface StorageUploadResult {
  path: string;
  publicUrl: string;
}

export interface StorageRemoveResult {
  removedPaths: string[];
}

export interface StorageObjectInspection {
  existingPaths: string[];
  missingPaths: string[];
}

export interface StorageBucketConfig {
  allowedMimeTypes: ["image/webp", "image/avif"];
  fileSizeLimit: number;
  id: "web00-catalog-images";
  public: true;
}

export type StorageBucketInspection =
  | {
      exists: false;
    }
  | {
      compatible: boolean;
      exists: true;
    };

export interface StorageBucketResult {
  created: boolean;
}

export interface ImageStorage {
  createBucket(input: StorageBucketConfig): Promise<StorageBucketResult>;
  getPublicUrl(path: string): string;
  inspectBucket(bucket: string): Promise<StorageBucketInspection>;
  inspectObjects(
    paths: readonly string[],
    context?: ImageStorageOperationContext
  ): Promise<StorageObjectInspection>;
  removeObjects(
    paths: readonly string[],
    context?: ImageStorageOperationContext
  ): Promise<StorageRemoveResult>;
  uploadObject(input: UploadImageObjectInput): Promise<StorageUploadResult>;
}
