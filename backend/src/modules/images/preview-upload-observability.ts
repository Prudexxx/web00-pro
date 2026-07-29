import { AppError } from "../../lib/errors.js";
import type { AppLogEntry } from "../../lib/logger.js";

export const PREVIEW_UPLOAD_STAGES = [
  "REQUEST_ACCEPTED",
  "MULTIPART_PARSE_STARTED",
  "MULTIPART_PARSED",
  "SITE_LOADED",
  "SITE_STATE_VALIDATED",
  "IMAGE_PROCESS_STARTED",
  "IMAGE_METADATA_READ",
  "IMAGE_WEBP_ENCODED",
  "IMAGE_AVIF_ENCODED",
  "IMAGE_PROCESS_COMPLETED",
  "PREUPLOAD_INSPECTION_STARTED",
  "PREUPLOAD_INSPECTION_COMPLETED",
  "RESERVATIONS_CREATE_STARTED",
  "RESERVATIONS_CREATED",
  "STORAGE_UPLOAD_STARTED",
  "STORAGE_UPLOAD_WEBP_COMPLETED",
  "STORAGE_UPLOAD_AVIF_COMPLETED",
  "STORAGE_UPLOAD_COMPLETED",
  "PREVIEW_URL_SELECTION_STARTED",
  "PREVIEW_URL_SELECTED",
  "DB_ATTACH_STARTED",
  "DB_SITE_UPDATED",
  "DB_RESERVATIONS_COMPLETED",
  "DB_CLEANUP_JOBS_CREATED",
  "DB_AUDIT_CREATED",
  "DB_ATTACH_COMMITTED",
  "ORPHAN_CLEANUP_SCHEDULED",
  "REQUEST_COMPLETED"
] as const;

export type PreviewUploadStage = (typeof PREVIEW_UPLOAD_STAGES)[number];

export type PreviewStorageDiagnosticCode =
  | "STORAGE_CONFIGURATION"
  | "STORAGE_INSPECT"
  | "STORAGE_UPLOAD"
  | "STORAGE_PUBLIC_URL"
  | "STORAGE_REMOVE";

export interface PreviewUploadDiagnostic {
  internalCode?: string;
  largestWebpFound?: boolean;
  prismaCode?: string;
  processedWidthCount?: number;
  providerCode?: string;
  providerStatus?: number;
  timedOut?: boolean;
  uploadedVariantCount?: number;
}

export interface PreviewUploadFailedEvent {
  cleanupScheduled: boolean;
  elapsedMs: number;
  errorClass: string;
  event: "site.preview_upload.failed";
  internalCode?: string;
  largestWebpFound?: boolean;
  prismaCode?: string;
  processedWidthCount?: number;
  providerCode?: string;
  providerStatus?: number;
  renderRequestIdPresent: boolean;
  requestId: string;
  stage: PreviewUploadStage;
  timedOut: boolean;
  uploadedVariantCount?: number;
}

export interface PreviewUploadCompletedEvent {
  elapsedMs: number;
  event: "site.preview_upload.completed";
  requestId: string;
  variantCount: number;
}

const diagnosticSymbol = Symbol.for("web00.previewUploadDiagnostic");
const safeIdentifierPattern = /^[A-Za-z0-9_.:-]{1,120}$/;
const prismaCodePattern = /^P\d{4}$/;
const uuidPattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const storagePathPattern =
  /sites\/[0-9a-f-]{36}\/(?:preview|gallery)\/[0-9a-f-]{36}\/[1-9]\d*\.(?:webp|avif)/i;
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const supabaseUrlPattern = /https?:\/\/[^/\s"'<>]*supabase\.co(?:[/?#][^\s"'<>]*)?/i;
const forbiddenKeyPattern =
  /^(?:authorization|cookie|password|email|token|access_?token|refresh_?token|database_?url|service_?key|storage_?path|supabase_?url)$/i;

export function attachPreviewUploadDiagnostic<T extends object>(
  error: T,
  diagnostic: PreviewUploadDiagnostic
): T {
  Object.defineProperty(error, diagnosticSymbol, {
    configurable: true,
    enumerable: false,
    value: normalizeDiagnostic(diagnostic)
  });

  return error;
}

export function createPreviewStorageDiagnostic(
  internalCode: PreviewStorageDiagnosticCode,
  providerError?: unknown
): PreviewUploadDiagnostic {
  const diagnostic: Record<string, unknown> = {
    internalCode,
    timedOut: isTimeoutLike(providerError)
  };
  const providerCode = readSafeProviderCode(providerError);
  const providerStatus = readSafeStatus(providerError);

  if (providerCode !== undefined) {
    diagnostic.providerCode = providerCode;
  }
  if (providerStatus !== undefined) {
    diagnostic.providerStatus = providerStatus;
  }

  return normalizeDiagnostic(diagnostic);
}

export function createPreviewUploadFailedEvent(input: {
  cleanupScheduled: boolean;
  elapsedMs: number;
  error: unknown;
  renderRequestIdPresent: boolean;
  requestId: string;
  stage: PreviewUploadStage;
}): PreviewUploadFailedEvent {
  const diagnostic = classifyPreviewUploadError(input.error);
  const event: PreviewUploadFailedEvent = {
    cleanupScheduled: input.cleanupScheduled,
    elapsedMs: normalizeElapsedMs(input.elapsedMs),
    errorClass: readErrorClass(input.error),
    event: "site.preview_upload.failed",
    renderRequestIdPresent: input.renderRequestIdPresent,
    requestId: input.requestId,
    stage: input.stage,
    timedOut: diagnostic.timedOut === true
  };

  if (diagnostic.internalCode !== undefined) {
    event.internalCode = diagnostic.internalCode;
  }
  if (diagnostic.largestWebpFound !== undefined) {
    event.largestWebpFound = diagnostic.largestWebpFound;
  }
  if (diagnostic.prismaCode !== undefined) {
    event.prismaCode = diagnostic.prismaCode;
  }
  if (diagnostic.processedWidthCount !== undefined) {
    event.processedWidthCount = diagnostic.processedWidthCount;
  }
  if (diagnostic.providerCode !== undefined) {
    event.providerCode = diagnostic.providerCode;
  }
  if (diagnostic.providerStatus !== undefined) {
    event.providerStatus = diagnostic.providerStatus;
  }
  if (diagnostic.uploadedVariantCount !== undefined) {
    event.uploadedVariantCount = diagnostic.uploadedVariantCount;
  }

  return sanitizePreviewUploadEvent(event);
}

export function createPreviewUploadCompletedEvent(input: {
  elapsedMs: number;
  requestId: string;
  variantCount: number;
}): PreviewUploadCompletedEvent {
  return {
    elapsedMs: normalizeElapsedMs(input.elapsedMs),
    event: "site.preview_upload.completed",
    requestId: input.requestId,
    variantCount: Math.max(0, Math.trunc(input.variantCount))
  };
}

export function createPreviewUploadLogEntry(input: {
  environment: string;
  event: PreviewUploadCompletedEvent | PreviewUploadFailedEvent;
  level: "error" | "info";
  service: string;
  time: Date;
}): AppLogEntry {
  return JSON.parse(
    serializePreviewDiagnosticEvent({
      ...input.event,
      environment: input.environment,
      level: input.level,
      service: input.service,
      time: input.time.toISOString()
    })
  ) as AppLogEntry;
}

export function serializePreviewDiagnosticEvent(input: unknown): string {
  return JSON.stringify(redactDiagnosticValue(input));
}

function classifyPreviewUploadError(error: unknown): PreviewUploadDiagnostic {
  const attached = readAttachedDiagnostic(error);
  const prismaCode = readPrismaCode(error) ?? attached.prismaCode;

  return normalizeDiagnostic({
    ...attached,
    prismaCode,
    timedOut:
      attached.timedOut === true ||
      prismaCode === "P2028" ||
      (error instanceof AppError && error.code === "IMAGE_PROCESSING_TIMEOUT") ||
      isTimeoutLike(error)
  });
}

function readAttachedDiagnostic(error: unknown): PreviewUploadDiagnostic {
  if (!isRecord(error)) {
    return {};
  }

  const diagnostic = (error as Record<PropertyKey, unknown>)[diagnosticSymbol];

  if (!isRecord(diagnostic)) {
    return {};
  }

  return normalizeDiagnostic(diagnostic);
}

function normalizeDiagnostic(
  input: PreviewUploadDiagnostic | Record<string, unknown>
): PreviewUploadDiagnostic {
  const output: PreviewUploadDiagnostic = {};
  const internalCode = readSafeIdentifier(input.internalCode);
  const prismaCode = readPrismaCode(input.prismaCode);
  const processedWidthCount = readSafeCount(input.processedWidthCount);
  const providerCode = readSafeIdentifier(input.providerCode);
  const providerStatus = readSafeStatus(input.providerStatus);
  const uploadedVariantCount = readSafeCount(input.uploadedVariantCount);

  if (internalCode !== undefined) {
    output.internalCode = internalCode;
  }
  if (typeof input.largestWebpFound === "boolean") {
    output.largestWebpFound = input.largestWebpFound;
  }
  if (prismaCode !== undefined) {
    output.prismaCode = prismaCode;
  }
  if (processedWidthCount !== undefined) {
    output.processedWidthCount = processedWidthCount;
  }
  if (providerCode !== undefined) {
    output.providerCode = providerCode;
  }
  if (providerStatus !== undefined) {
    output.providerStatus = providerStatus;
  }
  if (typeof input.timedOut === "boolean") {
    output.timedOut = input.timedOut;
  }
  if (uploadedVariantCount !== undefined) {
    output.uploadedVariantCount = uploadedVariantCount;
  }

  return output;
}

function sanitizePreviewUploadEvent<T extends PreviewUploadFailedEvent>(event: T): T {
  return JSON.parse(serializePreviewDiagnosticEvent(event)) as T;
}

function readErrorClass(error: unknown): string {
  if (!isRecord(error)) {
    return "UnknownError";
  }

  const name = readSafeIdentifier(error.name);

  if (name !== undefined) {
    return name;
  }

  const constructorName = readSafeIdentifier(
    (error as { constructor?: { name?: unknown } }).constructor?.name
  );

  return constructorName ?? "UnknownError";
}

function readSafeProviderCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return (
    readSafeIdentifier(error.code) ??
    readSafeIdentifier(error.errorCode) ??
    readSafeIdentifier(error.name) ??
    readSafeIdentifier((error as { constructor?: { name?: unknown } }).constructor?.name)
  );
}

function readPrismaCode(value: unknown): string | undefined {
  if (typeof value === "string" && prismaCodePattern.test(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  return readPrismaCode(value.code);
}

function readSafeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || !safeIdentifierPattern.test(value)) {
    return undefined;
  }

  return value;
}

function readSafeStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  return readSafeStatus(value.statusCode) ?? readSafeStatus(value.status);
}

function readSafeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

function isTimeoutLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const code = readSafeIdentifier(value.code);
  const name = readSafeIdentifier(value.name);

  return code === "ETIMEDOUT" || code === "P2028" || name === "TimeoutError";
}

function normalizeElapsedMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function redactDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => redactDiagnosticValue(item))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (forbiddenKeyPattern.test(key)) {
        continue;
      }

      const redacted = redactDiagnosticValue(nestedValue);

      if (redacted !== undefined) {
        output[key] = redacted;
      }
    }

    return output;
  }
  if (typeof value === "string") {
    if (containsForbiddenDiagnosticText(value)) {
      return "[REDACTED]";
    }

    return value;
  }
  if (value === undefined) {
    return undefined;
  }

  return value;
}

function containsForbiddenDiagnosticText(value: string): boolean {
  return (
    /^Bearer\s+/i.test(value) ||
    emailPattern.test(value) ||
    value.includes("postgresql://") ||
    value.includes("postgres://") ||
    value.includes("sb_secret_") ||
    supabaseUrlPattern.test(value) ||
    value.includes("/storage/v1/object/") ||
    storagePathPattern.test(value) ||
    uuidPattern.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
