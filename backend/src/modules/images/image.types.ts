export type ImageSlot = "gallery" | "preview";
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
  originalHeight: number;
  originalWidth: number;
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

export interface MultipartImageParser {
  parseBatch(request: NodeJS.ReadableStream): Promise<ParsedImageFile[]>;
  parseBatchStream(request: NodeJS.ReadableStream): AsyncIterable<ParsedImageFile>;
  parseSingle(request: NodeJS.ReadableStream): Promise<ParsedImageFile>;
}

export interface ImageProcessor {
  process(input: {
    assetId: string;
    declaredMimeType: string;
    siteId: string;
    slot: ImageSlot;
    source: Buffer;
  }): Promise<ProcessedImage>;
}

export interface ImagePipelineSemaphore {
  run<T>(operation: () => Promise<T>): Promise<T>;
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
