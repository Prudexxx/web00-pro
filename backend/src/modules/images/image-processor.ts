import sharp from "sharp";
import type { Metadata } from "sharp";
import { buildImageBasePath, buildVariantPath } from "./image-paths.js";
import { createImageAppError } from "./image.errors.js";
import {
  IMAGE_ENCODER_OPTIONS,
  selectVariantWidths
} from "./image-variants.js";
import { createImagePipelineSemaphore } from "./image-semaphore.js";
import type {
  ImagePipelineSemaphore,
  ImageProcessor,
  ImageSlot,
  ImageVariant,
  OutputFormat,
  ProcessedImage
} from "./image.types.js";

export interface SharpImageProcessorOptions {
  maxDimension?: number;
  maxOutputBytes?: number;
  maxOutputHeight?: number;
  maxPixels?: number;
  semaphore?: ImagePipelineSemaphore;
  timeoutMs?: number;
}

interface ImageMetadata {
  format: SourceFormat;
  height: number;
  hasAnimation: boolean;
  width: number;
}

type SourceFormat = "avif" | "jpeg" | "png" | "webp";

const declaredMimeTypes = new Map<string, SourceFormat>([
  ["image/avif", "avif"],
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const defaultMaxDimension = 20_000;
const defaultMaxOutputBytes = 5 * 1024 * 1024;
const defaultMaxOutputHeight = 12_000;
const defaultMaxPixels = 40_000_000;
const defaultTimeoutMs = 45_000;

export function createSharpImageProcessor(
  options: SharpImageProcessorOptions = {}
): ImageProcessor {
  const semaphore = options.semaphore ?? createImagePipelineSemaphore(4);

  return {
    process(input) {
      return withTimeout(
        semaphore.run(() => processImage(input, options)),
        options.timeoutMs ?? defaultTimeoutMs
      );
    }
  };
}

async function processImage(
  input: {
    assetId: string;
    declaredMimeType: string;
    siteId: string;
    slot: ImageSlot;
    source: Buffer;
  },
  options: SharpImageProcessorOptions
): Promise<ProcessedImage> {
  const expectedFormat = declaredMimeTypes.get(input.declaredMimeType);

  if (expectedFormat === undefined) {
    throw createImageAppError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Image format is not supported.",
      415
    );
  }

  const metadata = await readMetadata(input.source);

  if (metadata.format !== expectedFormat) {
    throw createImageAppError(
      "IMAGE_MIME_MISMATCH",
      "Image MIME type does not match image content.",
      415
    );
  }

  validateMetadata(metadata, options);

  const widths = selectVariantWidths(metadata.width);
  const variants: ImageVariant[] = [];
  const basePath = buildImageBasePath(input.siteId, input.slot, input.assetId);

  for (const width of widths) {
    variants.push(
      await encodeVariant({
        basePath,
        format: "webp",
        source: input.source,
        width
      })
    );
    variants.push(
      await encodeVariant({
        basePath,
        format: "avif",
        source: input.source,
        width
      })
    );
  }

  for (const variant of variants) {
    if (variant.body.length === 0 || variant.body.length > (options.maxOutputBytes ?? defaultMaxOutputBytes)) {
      throw createImageAppError(
        "IMAGE_OUTPUT_TOO_LARGE",
        "Processed image output is too large.",
        413
      );
    }
    if (variant.height > (options.maxOutputHeight ?? defaultMaxOutputHeight)) {
      throw createImageAppError(
        "IMAGE_PIXEL_LIMIT_EXCEEDED",
        "Image dimensions exceed the approved limits.",
        422
      );
    }
  }

  return {
    assetId: input.assetId,
    originalHeight: metadata.height,
    originalWidth: metadata.width,
    variants,
    widths
  };
}

async function readMetadata(source: Buffer): Promise<ImageMetadata> {
  let metadata: Metadata;

  try {
    metadata = await sharp(source, {
      animated: true,
      failOn: "error",
      limitInputPixels: false
    }).metadata();
  } catch {
    throw createImageAppError("IMAGE_INVALID", "Image could not be decoded.", 422);
  }

  const format = normalizeSourceFormat(metadata);

  if (format === null) {
    throw createImageAppError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Image format is not supported.",
      415
    );
  }

  if (metadata.width === undefined || metadata.height === undefined) {
    throw createImageAppError("IMAGE_INVALID", "Image could not be decoded.", 422);
  }

  return {
    format,
    hasAnimation: (metadata.pages ?? 1) > 1,
    height: metadata.height,
    width: metadata.width
  };
}

function validateMetadata(
  metadata: ImageMetadata,
  options: SharpImageProcessorOptions
): void {
  if (metadata.hasAnimation) {
    throw createImageAppError(
      "IMAGE_ANIMATION_NOT_ALLOWED",
      "Animated images are not allowed.",
      415
    );
  }

  const maxDimension = options.maxDimension ?? defaultMaxDimension;
  const maxPixels = options.maxPixels ?? defaultMaxPixels;

  if (
    metadata.width > maxDimension ||
    metadata.height > maxDimension ||
    metadata.width * metadata.height > maxPixels
  ) {
    throw createImageAppError(
      "IMAGE_PIXEL_LIMIT_EXCEEDED",
      "Image dimensions exceed the approved limits.",
      422
    );
  }
}

async function encodeVariant(input: {
  basePath: string;
  format: OutputFormat;
  source: Buffer;
  width: number;
}): Promise<ImageVariant> {
  let pipeline = sharp(input.source, { failOn: "error", limitInputPixels: false })
    .rotate()
    .toColorspace("srgb")
    .resize({
      fit: "inside",
      width: input.width,
      withoutEnlargement: true
    });

  if (input.format === "webp") {
    pipeline = pipeline.webp(IMAGE_ENCODER_OPTIONS.webp);
  } else {
    pipeline = pipeline.avif(IMAGE_ENCODER_OPTIONS.avif);
  }

  let body: Buffer;

  try {
    body = await pipeline.toBuffer();
  } catch {
    throw createImageAppError("IMAGE_INVALID", "Image could not be processed.", 422);
  }

  const outputMetadata = await readOutputMetadata(body, input.format);

  return {
    body,
    contentType: input.format === "webp" ? "image/webp" : "image/avif",
    format: input.format,
    height: outputMetadata.height,
    path: buildVariantPath(input.basePath, outputMetadata.width, input.format),
    width: outputMetadata.width
  };
}

async function readOutputMetadata(
  body: Buffer,
  format: OutputFormat
): Promise<{ height: number; width: number }> {
  try {
    const metadata = await sharp(body, { failOn: "error" }).metadata();

    if (
      metadata.mediaType !== (format === "webp" ? "image/webp" : "image/avif") ||
      metadata.width === undefined ||
      metadata.height === undefined
    ) {
      throw new Error("invalid output");
    }

    return {
      height: metadata.height,
      width: metadata.width
    };
  } catch {
    throw createImageAppError("IMAGE_INVALID", "Processed image output is invalid.", 422);
  }
}

function normalizeSourceFormat(metadata: Metadata): SourceFormat | null {
  if (
    metadata.format === "jpeg" ||
    metadata.format === "png" ||
    metadata.format === "webp"
  ) {
    return metadata.format;
  }

  if (metadata.mediaType === "image/avif") {
    return "avif";
  }

  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            createImageAppError(
              "IMAGE_PROCESSING_TIMEOUT",
              "Image processing timed out.",
              503
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
