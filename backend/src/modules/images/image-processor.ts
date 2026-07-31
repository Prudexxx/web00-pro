import sharp, {
  type Metadata,
  type Sharp,
  type SharpInput,
  type SharpOptions
} from "sharp";
import { performance } from "node:perf_hooks";
import {
  IMAGE_PROCESSING_CONCURRENCY_LIMITS,
  IMAGE_PROCESSING_MAX_PIXELS_LIMITS,
  IMAGE_PROCESSING_MAX_QUEUE_LIMITS,
  IMAGE_PROCESSING_QUEUE_WAIT_LIMITS,
  IMAGE_PROCESSING_TIMEOUT_LIMITS
} from "../../config/image-processing-env.js";
import { AppError } from "../../lib/errors.js";
import { buildImageBasePath, buildVariantPath } from "./image-paths.js";
import { createImageAppError } from "./image.errors.js";
import {
  IMAGE_ENCODER_OPTIONS,
  selectVariantWidths
} from "./image-variants.js";
import { createImagePipelineSemaphore } from "./image-semaphore.js";
import type {
  ImagePipelineSemaphore,
  ImageProcessingDiagnosticEvent,
  ImageProcessor,
  ImageProcessorDiagnosticStage,
  ImageSlot,
  ImageSourceFormat,
  ImageVariant,
  OutputFormat,
  ProcessedImage
} from "./image.types.js";

export type SharpFactory = (input: SharpInput, options?: SharpOptions) => Sharp;

export interface SharpImageProcessorOptions {
  maxConcurrency?: number;
  maxDimension?: number;
  maxOutputBytes?: number;
  maxOutputHeight?: number;
  maxPixels?: number;
  maxQueued?: number;
  queueWaitTimeoutMs?: number;
  semaphore?: ImagePipelineSemaphore;
  sharpFactory?: SharpFactory;
  timeoutMs?: number;
}

interface ImageMetadata {
  format: ImageSourceFormat;
  hasAnimation: boolean;
  height: number;
  orientation: number | null;
  pixels: number;
  width: number;
}

interface NormalizedSharpImageProcessorOptions {
  maxConcurrency: number;
  maxDimension: number;
  maxOutputBytes: number;
  maxOutputHeight: number;
  maxPixels: number;
  maxQueued: number;
  queueWaitTimeoutMs: number;
  sharpFactory: SharpFactory;
  timeoutMs: number;
}

interface ProcessingContext {
  aborted: boolean;
  activePipelines: Set<Sharp>;
  deadlineAt: number;
  maxPixels: number;
  sharpFactory: SharpFactory;
  signal?: AbortSignal | undefined;
  timedOut: boolean;
  timeoutMs: number;
}

const declaredMimeTypes = new Map<string, ImageSourceFormat>([
  ["image/avif", "avif"],
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const defaultMaxDimension = 20_000;
const defaultMaxOutputBytes = 5 * 1024 * 1024;
const defaultMaxOutputHeight = 12_000;
const defaultMaxPixels = IMAGE_PROCESSING_MAX_PIXELS_LIMITS.default;
const defaultTimeoutMs = IMAGE_PROCESSING_TIMEOUT_LIMITS.default;
const defaultMaxConcurrency = IMAGE_PROCESSING_CONCURRENCY_LIMITS.default;
const defaultMaxQueued = IMAGE_PROCESSING_MAX_QUEUE_LIMITS.default;
const defaultQueueWaitTimeoutMs = IMAGE_PROCESSING_QUEUE_WAIT_LIMITS.default;
const sharpCacheMemoryMb = 32;

export function createSharpImageProcessor(
  options: SharpImageProcessorOptions = {}
): ImageProcessor {
  const normalized = normalizeOptions(options);
  if (options.sharpFactory === undefined) {
    configureSharpResourceProfile();
  }
  const semaphore =
    options.semaphore ??
    createImagePipelineSemaphore({
      maxActive: normalized.maxConcurrency,
      maxQueued: normalized.maxQueued,
      queueWaitTimeoutMs: normalized.queueWaitTimeoutMs
    });

  return {
    timeoutMs: normalized.timeoutMs,
    process(input) {
      return semaphore.run(() => processImageWithTimeout(input, normalized), {
        signal: input.signal
      });
    }
  };
}

async function processImageWithTimeout(
  input: {
    assetId: string;
    declaredMimeType: string;
    onDiagnostic?: (event: ImageProcessingDiagnosticEvent) => void;
    onStage?: (stage: ImageProcessorDiagnosticStage) => void;
    siteId: string;
    slot: ImageSlot;
    signal?: AbortSignal | undefined;
    source: Buffer;
  },
  options: NormalizedSharpImageProcessorOptions
): Promise<ProcessedImage> {
  const context: ProcessingContext = {
    aborted: false,
    activePipelines: new Set(),
    deadlineAt: performance.now() + options.timeoutMs,
    maxPixels: options.maxPixels,
    sharpFactory: options.sharpFactory,
    signal: input.signal,
    timedOut: false,
    timeoutMs: options.timeoutMs
  };
  const startedAt = performance.now();
  let timeout: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  let abortReject: ((error: AppError) => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    abortReject = reject;
  });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      context.timedOut = true;
      const timeoutError = imageProcessingTimeout();

      emitProcessingDiagnostic(input, {
        durationMs: performance.now() - startedAt,
        errorCategory: timeoutError.code,
        stage: "PROCESSING_TIMEOUT",
        timeoutMs: options.timeoutMs
      });
      reject(timeoutError);

      for (const pipeline of context.activePipelines) {
        try {
          pipeline.destroy(timeoutError);
        } catch {
          continue;
        }
      }
    }, options.timeoutMs);
  });

  try {
    if (input.signal?.aborted === true) {
      throw clientAborted();
    }
    if (input.signal !== undefined) {
      abortListener = () => {
        const abortError = clientAborted();

        context.aborted = true;
        abortReject?.(abortError);
        for (const pipeline of context.activePipelines) {
          try {
            pipeline.destroy(abortError);
          } catch {
            continue;
          }
        }
      };
      input.signal.addEventListener("abort", abortListener, { once: true });
    }

    const processed = await Promise.race([
      processImage(input, options, context),
      timeoutPromise,
      abortPromise
    ]);

    emitProcessingDiagnostic(input, {
      durationMs: performance.now() - startedAt,
      format: processed.originalFormat,
      height: processed.originalHeight,
      orientation: processed.originalOrientation ?? null,
      pixels: processed.originalPixels,
      stage: "PROCESSING_COMPLETED",
      timeoutMs: options.timeoutMs,
      variantCount: processed.variants.length,
      width: processed.originalWidth
    });

    return processed;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (abortListener !== undefined && input.signal !== undefined) {
      input.signal.removeEventListener("abort", abortListener);
    }
    context.activePipelines.clear();
  }
}

async function processImage(
  input: {
    assetId: string;
    declaredMimeType: string;
    onDiagnostic?: (event: ImageProcessingDiagnosticEvent) => void;
    onStage?: (stage: ImageProcessorDiagnosticStage) => void;
    siteId: string;
    slot: ImageSlot;
    signal?: AbortSignal | undefined;
    source: Buffer;
  },
  options: NormalizedSharpImageProcessorOptions,
  context: ProcessingContext
): Promise<ProcessedImage> {
  const expectedFormat = declaredMimeTypes.get(input.declaredMimeType);

  if (expectedFormat === undefined) {
    throw createImageAppError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Image format is not supported.",
      415
    );
  }

  input.onStage?.("IMAGE_METADATA_READ");
  const metadata = await readMetadata(input, context);

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
  const preparedPipeline = context
    .sharpFactory(input.source, {
      failOn: "error",
      limitInputPixels: options.maxPixels
    })
    .rotate()
    .toColorspace("srgb");

  for (const width of widths) {
    assertProcessingCanContinue(context);
    input.onStage?.("IMAGE_WEBP_ENCODED");
    variants.push(
      await encodeVariant({
        basePath,
        context,
        format: "webp",
        preparedPipeline,
        width
      })
    );
    assertProcessingCanContinue(context);
    input.onStage?.("IMAGE_AVIF_ENCODED");
    variants.push(
      await encodeVariant({
        basePath,
        context,
        format: "avif",
        preparedPipeline,
        width
      })
    );
  }

  for (const variant of variants) {
    if (variant.body.length === 0 || variant.body.length > options.maxOutputBytes) {
      throw createImageAppError(
        "IMAGE_OUTPUT_TOO_LARGE",
        "Processed image output is too large.",
        413
      );
    }
    if (variant.height > options.maxOutputHeight) {
      throw createImageAppError(
        "IMAGE_PIXEL_LIMIT_EXCEEDED",
        "Image dimensions exceed the approved limits.",
        422
      );
    }
  }

  input.onStage?.("IMAGE_PROCESS_COMPLETED");

  return {
    assetId: input.assetId,
    originalFormat: metadata.format,
    originalHeight: metadata.height,
    originalOrientation: metadata.orientation,
    originalPixels: metadata.pixels,
    originalWidth: metadata.width,
    variants,
    widths
  };
}

async function readMetadata(
  input: {
    onDiagnostic?: (event: ImageProcessingDiagnosticEvent) => void;
    source: Buffer;
  },
  context: ProcessingContext
): Promise<ImageMetadata> {
  let metadata: Metadata;
  const startedAt = performance.now();

  try {
    metadata = await runTrackedPipeline(
      context,
      context.sharpFactory(input.source, {
        animated: true,
        failOn: "error",
        limitInputPixels: context.maxPixels
      }),
      (pipeline) => pipeline.metadata()
    );
  } catch (error) {
    if (context.aborted || isClientAborted(error)) {
      throw clientAborted();
    }
    if (context.timedOut || isImageProcessingTimeout(error) || isSharpTimeoutError(error)) {
      throw imageProcessingTimeout();
    }
    if (isSharpPixelLimitError(error)) {
      throw createImageAppError(
        "IMAGE_PIXEL_LIMIT_EXCEEDED",
        "Image dimensions exceed the approved limits.",
        422
      );
    }

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

  const imageMetadata = {
    format,
    hasAnimation: (metadata.pages ?? 1) > 1,
    height: metadata.height,
    orientation: normalizeOrientation(metadata.orientation),
    pixels: metadata.width * metadata.height,
    width: metadata.width
  };

  emitProcessingDiagnostic(input, {
    durationMs: performance.now() - startedAt,
    format: imageMetadata.format,
    height: imageMetadata.height,
    orientation: imageMetadata.orientation,
    pixels: imageMetadata.pixels,
    stage: "METADATA_READ",
    timeoutMs: context.timeoutMs,
    width: imageMetadata.width
  });

  return imageMetadata;
}

function validateMetadata(
  metadata: ImageMetadata,
  options: NormalizedSharpImageProcessorOptions
): void {
  if (metadata.hasAnimation) {
    throw createImageAppError(
      "IMAGE_ANIMATION_NOT_ALLOWED",
      "Animated images are not allowed.",
      415
    );
  }

  if (
    metadata.width > options.maxDimension ||
    metadata.height > options.maxDimension ||
    metadata.pixels > options.maxPixels
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
  context: ProcessingContext;
  format: OutputFormat;
  preparedPipeline: Sharp;
  width: number;
}): Promise<ImageVariant> {
  let pipeline = input.preparedPipeline.clone().resize({
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
    body = await runTrackedPipeline(input.context, pipeline, (current) =>
      current.toBuffer()
    );
  } catch (error) {
    if (input.context.aborted || isClientAborted(error)) {
      throw clientAborted();
    }
    if (
      input.context.timedOut ||
      isImageProcessingTimeout(error) ||
      isSharpTimeoutError(error)
    ) {
      throw imageProcessingTimeout();
    }

    throw createImageAppError("IMAGE_INVALID", "Image could not be processed.", 422);
  }

  const outputMetadata = await readOutputMetadata(body, input.format, input.context);

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
  format: OutputFormat,
  context: ProcessingContext
): Promise<{ height: number; width: number }> {
  try {
    const metadata = await runTrackedPipeline(
      context,
      context.sharpFactory(body, { failOn: "error" }),
      (pipeline) => pipeline.metadata()
    );

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
  } catch (error) {
    if (context.aborted || isClientAborted(error)) {
      throw clientAborted();
    }
    if (context.timedOut || isImageProcessingTimeout(error) || isSharpTimeoutError(error)) {
      throw imageProcessingTimeout();
    }

    throw createImageAppError("IMAGE_INVALID", "Processed image output is invalid.", 422);
  }
}

async function runTrackedPipeline<T>(
  context: ProcessingContext,
  pipeline: Sharp,
  operation: (pipeline: Sharp) => Promise<T>
): Promise<T> {
  assertProcessingCanContinue(context);
  context.activePipelines.add(pipeline);
  const timedPipeline = applyNativePipelineTimeout(context, pipeline);

  try {
    return await operation(timedPipeline);
  } finally {
    context.activePipelines.delete(pipeline);
  }
}

function normalizeSourceFormat(metadata: Metadata): ImageSourceFormat | null {
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

function normalizeOrientation(value: number | undefined): number | null {
  if (Number.isInteger(value) && value !== undefined && value > 0) {
    return value;
  }

  return null;
}

function normalizeOptions(
  options: SharpImageProcessorOptions
): NormalizedSharpImageProcessorOptions {
  return {
    maxConcurrency: readPositiveInteger(
      options.maxConcurrency,
      defaultMaxConcurrency,
      "maxConcurrency"
    ),
    maxDimension: readPositiveInteger(options.maxDimension, defaultMaxDimension, "maxDimension"),
    maxOutputBytes: readPositiveInteger(
      options.maxOutputBytes,
      defaultMaxOutputBytes,
      "maxOutputBytes"
    ),
    maxOutputHeight: readPositiveInteger(
      options.maxOutputHeight,
      defaultMaxOutputHeight,
      "maxOutputHeight"
    ),
    maxPixels: readPositiveInteger(options.maxPixels, defaultMaxPixels, "maxPixels"),
    maxQueued: readNonNegativeInteger(options.maxQueued, defaultMaxQueued, "maxQueued"),
    queueWaitTimeoutMs: readPositiveInteger(
      options.queueWaitTimeoutMs,
      defaultQueueWaitTimeoutMs,
      "queueWaitTimeoutMs"
    ),
    sharpFactory: options.sharpFactory ?? sharp,
    timeoutMs: readPositiveInteger(options.timeoutMs, defaultTimeoutMs, "timeoutMs")
  };
}

function readPositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function configureSharpResourceProfile(): void {
  sharp.concurrency(defaultMaxConcurrency);
  sharp.cache({
    files: 0,
    items: 128,
    memory: sharpCacheMemoryMb
  });
}

function assertProcessingCanContinue(context: ProcessingContext): void {
  if (context.signal?.aborted === true) {
    context.aborted = true;
    throw clientAborted();
  }
  if (context.timedOut) {
    throw imageProcessingTimeout();
  }
}

function applyNativePipelineTimeout(context: ProcessingContext, pipeline: Sharp): Sharp {
  const timeout = (pipeline as Sharp & {
    timeout?: (options: { seconds: number }) => Sharp;
  }).timeout;

  if (typeof timeout !== "function") {
    return pipeline;
  }

  const remainingMs = Math.max(1, context.deadlineAt - performance.now());
  const seconds = Math.max(1, Math.ceil(remainingMs / 1_000));

  return timeout.call(pipeline, { seconds });
}

function imageProcessingTimeout(): AppError {
  return createImageAppError(
    "IMAGE_PROCESSING_TIMEOUT",
    "Image processing timed out.",
    503
  );
}

function clientAborted(): AppError {
  return createImageAppError(
    "CLIENT_ABORTED",
    "Image processing request was aborted.",
    499
  );
}

function isImageProcessingTimeout(error: unknown): boolean {
  return error instanceof AppError && error.code === "IMAGE_PROCESSING_TIMEOUT";
}

function isClientAborted(error: unknown): boolean {
  return error instanceof AppError && error.code === "CLIENT_ABORTED";
}

function isSharpPixelLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /pixel limit|Input image exceeds limit/i.test(error.message)
  );
}

function isSharpTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout|timed out/i.test(error.message);
}

function emitProcessingDiagnostic(
  input: { onDiagnostic?: (event: ImageProcessingDiagnosticEvent) => void },
  event: ImageProcessingDiagnosticEvent
): void {
  try {
    input.onDiagnostic?.(normalizeProcessingDiagnostic(event));
  } catch {
    return;
  }
}

function normalizeProcessingDiagnostic(
  event: ImageProcessingDiagnosticEvent
): ImageProcessingDiagnosticEvent {
  return {
    ...event,
    durationMs: normalizeNonNegativeInteger(event.durationMs),
    height: normalizePositiveInteger(event.height),
    orientation:
      event.orientation === null ? null : normalizePositiveInteger(event.orientation),
    pixels: normalizePositiveInteger(event.pixels),
    timeoutMs: normalizePositiveInteger(event.timeoutMs),
    variantCount: normalizeNonNegativeInteger(event.variantCount),
    width: normalizePositiveInteger(event.width)
  };
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.trunc(value);
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}
