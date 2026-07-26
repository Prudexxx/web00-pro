import type { IncomingHttpHeaders } from "node:http";
import Busboy from "busboy";
import { AppError } from "../../lib/errors.js";
import { createImageAppError } from "./image.errors.js";
import type {
  MultipartImageParser,
  ParsedImageFile
} from "./image.types.js";

export const IMAGE_MULTIPART_LIMITS = {
  batchFiles: 10,
  batchTotalBytes: 30 * 1024 * 1024,
  fieldNameSize: 80,
  fields: 2,
  fileSize: 5 * 1024 * 1024,
  files: 10,
  headerPairs: 100,
  singleFiles: 1,
  textFieldSize: 16 * 1024
} as const;

export interface MultipartImageParserOptions {
  batchFiles?: number;
  batchTotalBytes?: number;
  fileSize?: number;
  textFieldSize?: number;
}

interface MultipartRequest extends NodeJS.ReadableStream {
  headers?: IncomingHttpHeaders;
}

interface RawParsedFile {
  declaredMimeType: string;
  fieldName: string;
  index: number;
  source: Buffer;
}

interface RawMultipartResult {
  fields: Map<string, string>;
  files: RawParsedFile[];
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createBusboyMultipartImageParser(
  options: MultipartImageParserOptions = {}
): MultipartImageParser {
  const limits = {
    ...IMAGE_MULTIPART_LIMITS,
    ...options
  };

  return {
    async parseBatch(request) {
      const files: ParsedImageFile[] = [];

      for await (const file of createBatchFileStream(request as MultipartRequest, {
        allowedFileField: "images",
        allowedTextFields: new Set(["metadata"]),
        maxFiles: limits.batchFiles,
        totalBytes: limits.batchTotalBytes,
        perFileBytes: limits.fileSize,
        textFieldSize: limits.textFieldSize
      })) {
        files.push(file);
      }

      return files;
    },
    parseBatchStream(request) {
      return createBatchFileStream(request as MultipartRequest, {
        allowedFileField: "images",
        allowedTextFields: new Set(["metadata"]),
        maxFiles: limits.batchFiles,
        totalBytes: limits.batchTotalBytes,
        perFileBytes: limits.fileSize,
        textFieldSize: limits.textFieldSize
      });
    },
    async parseSingle(request) {
      const result = await parseMultipart(request as MultipartRequest, {
        allowedFileField: "image",
        allowedTextFields: new Set(["clientFileId", "alt"]),
        maxFiles: limits.singleFiles,
        totalBytes: limits.fileSize,
        perFileBytes: limits.fileSize,
        textFieldSize: limits.textFieldSize
      });

      return toSingleFile(result);
    }
  };
}

async function parseMultipart(
  request: MultipartRequest,
  options: {
    allowedFileField: "image" | "images";
    allowedTextFields: ReadonlySet<string>;
    maxFiles: number;
    perFileBytes: number;
    textFieldSize: number;
    totalBytes: number;
  }
): Promise<RawMultipartResult> {
  const headers = request.headers ?? {};
  const fields = new Map<string, string>();
  const files: RawParsedFile[] = [];
  let totalBytes = 0;
  let failure: AppError | undefined;

  return await new Promise<RawMultipartResult>((resolve, reject) => {
    function fail(error: AppError): void {
      failure ??= error;
    }

    let parser: ReturnType<typeof Busboy>;

    try {
      parser = Busboy({
        headers,
        limits: {
          fieldNameSize: IMAGE_MULTIPART_LIMITS.fieldNameSize,
          fields: IMAGE_MULTIPART_LIMITS.fields,
          fileSize: options.perFileBytes,
          files: options.maxFiles,
          headerPairs: IMAGE_MULTIPART_LIMITS.headerPairs,
          fieldSize: options.textFieldSize
        }
      });
    } catch {
      reject(validationError("Invalid multipart request."));
      return;
    }

    parser.on("field", (name, value) => {
      if (!options.allowedTextFields.has(name)) {
        fail(validationError("Unknown multipart field."));
        return;
      }
      if (fields.has(name)) {
        fail(validationError("Duplicate multipart field."));
        return;
      }

      fields.set(name, value);
    });
    parser.on("file", (name, file, info) => {
      const chunks: Buffer[] = [];
      const index = files.length;

      if (name !== options.allowedFileField) {
        fail(validationError("Unknown multipart file field."));
      }

      file.on("limit", () => {
        fail(createImageAppError("IMAGE_TOO_LARGE", "Image is too large.", 413));
      });
      file.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;

        if (totalBytes > options.totalBytes) {
          fail(
            createImageAppError(
              "IMAGE_TOTAL_SIZE_EXCEEDED",
              "Total image upload size is too large.",
              413
            )
          );
          return;
        }

        chunks.push(chunk);
      });
      file.on("end", () => {
        files.push({
          declaredMimeType: info.mimeType,
          fieldName: name,
          index,
          source: Buffer.concat(chunks)
        });
      });
    });
    parser.on("filesLimit", () => {
      fail(
        options.allowedFileField === "images"
          ? createImageAppError(
              "IMAGE_BATCH_LIMIT_EXCEEDED",
              "Too many images were uploaded.",
              400
            )
          : validationError("Too many files.")
      );
    });
    parser.on("fieldsLimit", () => {
      fail(validationError("Too many multipart fields."));
    });
    parser.on("error", () => {
      reject(validationError("Invalid multipart request."));
    });
    parser.on("finish", () => {
      if (failure !== undefined) {
        reject(failure);
        return;
      }

      resolve({ fields, files });
    });

    request.pipe(parser);
  });
}

function createBatchFileStream(
  request: MultipartRequest,
  options: {
    allowedFileField: "images";
    allowedTextFields: ReadonlySet<string>;
    maxFiles: number;
    perFileBytes: number;
    textFieldSize: number;
    totalBytes: number;
  }
): AsyncIterable<ParsedImageFile> {
  const queue = createAsyncQueue<ParsedImageFile>();
  const headers = request.headers ?? {};
  const activeChunks = new Set<Buffer[]>();
  let metadata: ReturnType<typeof parseMetadata> | undefined;
  let parser: ReturnType<typeof Busboy> | undefined;
  let parserFinished = false;
  let settled = false;
  let totalBytes = 0;
  let filesSeen = 0;
  let metadataSeen = false;
  const seenIds = new Set<string>();

  function cleanupBuffers(): void {
    for (const chunks of activeChunks) {
      chunks.length = 0;
    }
    activeChunks.clear();
  }

  function cleanupListeners(): void {
    request.removeListener("aborted", abort);
    request.removeListener("close", onClose);
  }

  function fail(error: AppError): void {
    if (settled) {
      return;
    }

    settled = true;
    cleanupBuffers();
    cleanupListeners();
    request.unpipe(parser);
    queue.fail(error);
  }

  function abort(): void {
    fail(validationError("Invalid multipart request."));
  }

  function onClose(): void {
    if (!parserFinished && !isReadableEnded(request)) {
      abort();
    }
  }

  function emitRawFile(raw: RawParsedFile): void {
    if (settled) {
      return;
    }

    if (metadata === undefined) {
      fail(validationError("Metadata is required before images."));
      return;
    }

    try {
      const item = metadata[raw.index];
      const assetId = parseUuidField(item?.clientFileId, `metadata.${raw.index}.clientFileId`);

      if (seenIds.has(assetId)) {
        throw validationError("Duplicate clientFileId.");
      }
      seenIds.add(assetId);
      queue.push({
        alt: parseAlt(item?.alt),
        assetId,
        declaredMimeType: raw.declaredMimeType,
        index: raw.index,
        source: raw.source
      });
    } catch (error) {
      fail(error instanceof AppError ? error : validationError("Invalid multipart request."));
    }
  }

  try {
    parser = Busboy({
      headers,
      limits: {
        fieldNameSize: IMAGE_MULTIPART_LIMITS.fieldNameSize,
        fields: IMAGE_MULTIPART_LIMITS.fields,
        fileSize: options.perFileBytes,
        files: options.maxFiles,
        headerPairs: IMAGE_MULTIPART_LIMITS.headerPairs,
        fieldSize: options.textFieldSize
      }
    });
  } catch {
    queue.fail(validationError("Invalid multipart request."));
    return queue;
  }

  request.once("aborted", abort);
  request.once("close", onClose);

  parser.on("field", (name, value) => {
    if (!options.allowedTextFields.has(name)) {
      fail(validationError("Unknown multipart field."));
      return;
    }
    if (name !== "metadata" || metadataSeen) {
      fail(validationError("Duplicate multipart field."));
      return;
    }

    metadataSeen = true;

    try {
      metadata = parseMetadata(value);
    } catch (error) {
      fail(error instanceof AppError ? error : validationError("Invalid multipart request."));
      return;
    }

  });
  parser.on("file", (name, file, info) => {
    const chunks: Buffer[] = [];
    const index = filesSeen;

    filesSeen += 1;
    activeChunks.add(chunks);

    if (name !== options.allowedFileField) {
      fail(validationError("Unknown multipart file field."));
      file.resume();
      return;
    }
    if (filesSeen > options.maxFiles) {
      fail(createImageAppError("IMAGE_BATCH_LIMIT_EXCEEDED", "Too many images were uploaded.", 400));
      file.resume();
      return;
    }
    if (metadata === undefined) {
      fail(validationError("Metadata is required before images."));
      file.resume();
      return;
    }

    file.on("limit", () => {
      fail(createImageAppError("IMAGE_TOO_LARGE", "Image is too large.", 413));
    });
    file.on("error", () => {
      fail(validationError("Invalid multipart request."));
    });
    file.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }

      totalBytes += chunk.length;

      if (totalBytes > options.totalBytes) {
        fail(
          createImageAppError(
            "IMAGE_TOTAL_SIZE_EXCEEDED",
            "Total image upload size is too large.",
            413
          )
        );
        return;
      }

      chunks.push(chunk);
    });
    file.on("end", () => {
      activeChunks.delete(chunks);

      if (settled) {
        chunks.length = 0;
        return;
      }

      emitRawFile({
        declaredMimeType: info.mimeType,
        fieldName: name,
        index,
        source: Buffer.concat(chunks)
      });
      chunks.length = 0;
    });
  });
  parser.on("filesLimit", () => {
    fail(createImageAppError("IMAGE_BATCH_LIMIT_EXCEEDED", "Too many images were uploaded.", 400));
  });
  parser.on("fieldsLimit", () => {
    fail(validationError("Too many multipart fields."));
  });
  parser.on("error", () => {
    fail(validationError("Invalid multipart request."));
  });
  parser.on("finish", () => {
    parserFinished = true;

    if (settled) {
      return;
    }
    if (metadata === undefined) {
      fail(validationError("Metadata is required."));
      return;
    }
    if (filesSeen === 0) {
      fail(createImageAppError("IMAGE_REQUIRED", "Image is required.", 400));
      return;
    }
    if (metadata.length !== filesSeen) {
      fail(validationError("Metadata must have one item per image."));
      return;
    }

    if (!settled) {
      settled = true;
      cleanupListeners();
      queue.end();
    }
  });

  request.pipe(parser);

  return queue;
}

interface AsyncQueue<T> extends AsyncIterable<T>, AsyncIterator<T> {
  end(): void;
  fail(error: Error): void;
  push(value: T): void;
}

function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = [];
  const waiting: Array<{
    reject: (error: Error) => void;
    resolve: (value: IteratorResult<T>) => void;
  }> = [];
  let done = false;
  let failure: Error | undefined;

  function settleNext(): void {
    const waiter = waiting.shift();

    if (waiter === undefined) {
      return;
    }
    if (failure !== undefined) {
      waiter.reject(failure);
      return;
    }
    const value = values.shift();

    if (value !== undefined) {
      waiter.resolve({ done: false, value });
      return;
    }
    if (done) {
      waiter.resolve({ done: true, value: undefined });
      return;
    }

    waiting.unshift(waiter);
  }

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    end() {
      if (done || failure !== undefined) {
        return;
      }

      done = true;

      while (waiting.length > 0) {
        settleNext();
      }
    },
    fail(error) {
      if (done || failure !== undefined) {
        return;
      }

      failure = error;

      while (waiting.length > 0) {
        settleNext();
      }
    },
    next() {
      if (failure !== undefined) {
        return Promise.reject(failure);
      }

      const value = values.shift();

      if (value !== undefined) {
        return Promise.resolve({ done: false, value });
      }
      if (done) {
        return Promise.resolve({ done: true, value: undefined });
      }

      return new Promise<IteratorResult<T>>((resolve, reject) => {
        waiting.push({ reject, resolve });
      });
    },
    push(value) {
      if (done || failure !== undefined) {
        return;
      }

      values.push(value);
      settleNext();
    }
  };
}

function isReadableEnded(request: MultipartRequest): boolean {
  return (request as MultipartRequest & { readableEnded?: boolean }).readableEnded === true;
}

function toSingleFile(result: RawMultipartResult): ParsedImageFile {
  const file = result.files[0];

  if (file === undefined) {
    throw createImageAppError("IMAGE_REQUIRED", "Image is required.", 400);
  }
  if (result.files.length !== 1 || file.fieldName !== "image") {
    throw validationError("Expected exactly one image file.");
  }

  const assetId = parseUuidField(result.fields.get("clientFileId"), "clientFileId");
  const alt = parseAlt(result.fields.get("alt"));

  return {
    alt,
    assetId,
    declaredMimeType: file.declaredMimeType,
    index: 0,
    source: file.source
  };
}

function toBatchFiles(result: RawMultipartResult): ParsedImageFile[] {
  const metadata = parseMetadata(result.fields.get("metadata"));

  if (result.files.length === 0) {
    throw createImageAppError("IMAGE_REQUIRED", "Image is required.", 400);
  }
  if (result.files.length > IMAGE_MULTIPART_LIMITS.batchFiles) {
    throw createImageAppError(
      "IMAGE_BATCH_LIMIT_EXCEEDED",
      "Too many images were uploaded.",
      400
    );
  }
  if (metadata.length !== result.files.length) {
    throw validationError("Metadata must have one item per image.");
  }

  const seen = new Set<string>();

  return result.files.map((file, index) => {
    if (file.fieldName !== "images") {
      throw validationError("Expected only images files.");
    }

    const item = metadata[index];
    const assetId = parseUuidField(item?.clientFileId, `metadata.${index}.clientFileId`);

    if (seen.has(assetId)) {
      throw validationError("Duplicate clientFileId.");
    }
    seen.add(assetId);

    return {
      alt: parseAlt(item?.alt),
      assetId,
      declaredMimeType: file.declaredMimeType,
      index,
      source: file.source
    };
  });
}

function parseMetadata(value: string | undefined): Array<{
  alt?: unknown;
  clientFileId?: unknown;
}> {
  if (value === undefined) {
    throw validationError("Metadata is required.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw validationError("Metadata must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw validationError("Metadata must be an array.");
  }

  return parsed as Array<{ alt?: unknown; clientFileId?: unknown }>;
}

function parseUuidField(value: unknown, path: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw validationError(`${path} must be a valid UUID.`);
  }

  return value;
}

function parseAlt(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw validationError("Alt text must be a string.");
  }

  const trimmed = value.trim();

  if (trimmed.length > 160) {
    throw validationError("Alt text must be at most 160 characters.");
  }

  return trimmed;
}

function validationError(message: string): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    statusCode: 400
  });
}
