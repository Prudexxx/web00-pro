export type ImageSlot = "gallery" | "preview";
export type ImageSourceFormat = "avif" | "jpeg" | "png" | "webp";
export type OutputFormat = "avif" | "webp";

export interface ImageVariant {
  body: Buffer;
  contentType: "image/avif" | "image/webp";
  format: OutputFormat;
  height: number;
  path: string;
  width: number;
}

export interface ProcessedImage {
  assetId: string;
  originalFormat?: ImageSourceFormat;
  originalHeight: number;
  originalOrientation?: number | null;
  originalPixels?: number;
  originalWidth: number;
  sourceSha256: string;
  variants: ImageVariant[];
  widths: number[];
}

export interface ParsedImageFile {
  alt: string;
  assetId: string;
  declaredMimeType: string;
  index: number;
  source: Buffer;
}

export type ImageProcessorDiagnosticStage =
  | "IMAGE_METADATA_READ"
  | "IMAGE_WEBP_ENCODED"
  | "IMAGE_AVIF_ENCODED"
  | "IMAGE_PROCESS_COMPLETED";

export type ImageProcessingDiagnosticStage =
  | "QUEUE_ACQUIRED"
  | "QUEUE_REJECTED"
  | "QUEUE_TIMEOUT"
  | "METADATA_READ"
  | "PROCESSING_COMPLETED"
  | "PROCESSING_STARTED"
  | "PROCESSING_TIMEOUT"
  | "PROCESSOR_DRAIN_FAILED";

export interface ImageProcessingDiagnosticEvent {
  durationMs?: number | undefined;
  errorCategory?: string | undefined;
  format?: ImageSourceFormat | undefined;
  height?: number | undefined;
  orientation?: number | null | undefined;
  pixels?: number | undefined;
  stage: ImageProcessingDiagnosticStage;
  timeoutMs?: number | undefined;
  variantCount?: number | undefined;
  width?: number | undefined;
}

export interface MultipartImageParser {
  parseBatch(request: NodeJS.ReadableStream): Promise<ParsedImageFile[]>;
  parseBatchStream(request: NodeJS.ReadableStream): AsyncIterable<ParsedImageFile>;
  parseSingle(request: NodeJS.ReadableStream): Promise<ParsedImageFile>;
}

export interface ImageProcessor {
  readonly timeoutMs?: number;
  process(input: {
    assetId: string;
    declaredMimeType: string;
    onDiagnostic?: (event: ImageProcessingDiagnosticEvent) => void;
    onStage?: (stage: ImageProcessorDiagnosticStage) => void;
    siteId: string;
    slot: ImageSlot;
    signal?: AbortSignal | undefined;
    source: Buffer;
  }): Promise<ProcessedImage>;
}

export interface ImagePipelineSemaphore {
  run<T>(
    operation: () => Promise<T>,
    options?: { signal?: AbortSignal | undefined }
  ): Promise<T>;
  stats?(): { active: number; queued: number };
}

export interface AssetUploadCoordinator {
  runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface PublicImageVariant {
  avifUrl: string;
  webpUrl: string;
  width: number;
}

export interface PublicPreviewImage {
  assetId: string;
  url: string;
  variants: PublicImageVariant[];
}

export interface ManagedImageDescriptor {
  assetId: string;
  siteId: string;
  slot: ImageSlot;
  storagePath: string;
  url: string;
  widths: number[];
}

export interface ManagedPreviewDescriptor extends ManagedImageDescriptor {
  slot: "preview";
}

export interface ManagedGalleryDescriptor extends ManagedImageDescriptor {
  slot: "gallery";
}

export interface ManagedGalleryImage {
  alt: string;
  assetId: string;
  sortOrder: number;
  storagePath: `sites/${string}/gallery/${string}`;
  url: string;
}

export interface PublicManagedGalleryImage extends ManagedGalleryImage {
  variants: PublicImageVariant[];
}

export interface ManagedImageUrlPolicy {
  buildVariants(input: ManagedImageDescriptor): PublicImageVariant[];
  parseManagedGallery(siteId: string, url: string): ManagedGalleryDescriptor | null;
  parseManagedPreview(siteId: string, url: string): ManagedPreviewDescriptor | null;
}

export interface Clock {
  now(): Date;
}
