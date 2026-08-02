import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "../config/env.js";
import type { ErrorCode } from "./errors.js";

export interface RequestLogEntry {
  durationMs: number;
  environment: AppEnv["NODE_ENV"];
  level: "info";
  method: string;
  path: string;
  requestId: string;
  service: string;
  statusCode: number;
  time: string;
}

export interface LifecycleLogEntry {
  environment: AppEnv["NODE_ENV"];
  event: string;
  level: "info" | "error";
  service: string;
  time: string;
}

export interface AuthSecurityLogEntry {
  emailHash?: string;
  environment: AppEnv["NODE_ENV"] | string;
  event: "auth.login.failed";
  level: "warn";
  requestId: string;
  service: string;
  time: string;
}

export interface SiteCreateDraftFailedLogEntry {
  databaseErrorCode: string | null;
  databaseErrorMessageCategory: string | null;
  elapsedMs: number;
  environment: AppEnv["NODE_ENV"] | string;
  errorClass: string;
  event: "site.create_draft.failed";
  level: "error";
  prismaCode: string | null;
  requestId: string;
  service: string;
  stage: string;
  time: string;
  transactionCallbackCompleted: boolean;
}

export interface GalleryImageFileLogEntry {
  clientFileId: string;
  durationMs?: number | undefined;
  environment: AppEnv["NODE_ENV"] | string;
  errorCategory?: string | undefined;
  event: "site.gallery_image.file";
  format?: "avif" | "jpeg" | "png" | "webp" | undefined;
  height?: number | undefined;
  level: "error" | "info";
  orientation?: number | null | undefined;
  pixels?: number | undefined;
  requestId: string;
  service: string;
  stage:
    | "FILE_COMPLETED"
    | "METADATA_READ"
    | "PROCESSING_COMPLETED"
    | "PROCESSING_STARTED"
    | "PROCESSING_TIMEOUT"
    | "STORAGE_UPLOAD_COMPLETED"
    | "STORAGE_UPLOAD_STARTED";
  time: string;
  timeoutMs?: number | undefined;
  variantCount?: number | undefined;
  width?: number | undefined;
}

export type PublicCatalogSyncFailedStage =
  | "db_finalize"
  | "lease"
  | "manifest_upload"
  | "manifest_verify"
  | "projection"
  | "settings"
  | "snapshot_build"
  | "snapshot_upload"
  | "snapshot_verify";

export interface PublicCatalogSyncFailedStageLogEntry {
  durationMs: number;
  errorClass: string;
  errorCode: ErrorCode;
  requestId: string;
  revision: number | null;
  stage: PublicCatalogSyncFailedStage;
}

export interface PublicCatalogDryRunCompletedLogEntry {
  blockersCount: number;
  byteLength: number | null;
  durationMs: number;
  event: "public_catalog_dry_run_completed";
  itemsCount: number;
  requestId: string;
  revision: number;
  sha256: string | null;
  status: "ready" | "blocked";
}

export interface PublicCatalogDryRunFailedLogEntry {
  durationMs: number;
  errorClass: string;
  errorCode: ErrorCode;
  event: "public_catalog_dry_run_failed";
  requestId: string;
  revision: number | null;
  stage: string;
}

export type AppLogEntry =
  | AuthSecurityLogEntry
  | GalleryImageFileLogEntry
  | LifecycleLogEntry
  | PublicCatalogDryRunCompletedLogEntry
  | PublicCatalogDryRunFailedLogEntry
  | PublicCatalogSyncFailedStageLogEntry
  | RequestLogEntry
  | SiteCreateDraftFailedLogEntry;

export interface AppLogger {
  log(entry: AppLogEntry): void;
}

export interface CreateLoggerOptions {
  env: AppEnv;
  write?: (line: string) => void;
}

export interface RequestLoggerOptions {
  env: AppEnv;
  logger: AppLogger;
  now: () => Date;
}

export function createLogger(options: CreateLoggerOptions): AppLogger {
  const write = options.write ?? ((line: string) => console.log(line));

  return {
    log: (entry) => {
      if (options.env.LOG_LEVEL === "silent") {
        return;
      }

      write(JSON.stringify(entry));
    }
  };
}

export function requestLogger(options: RequestLoggerOptions) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    response.on("finish", () => {
      options.logger.log({
        durationMs: Math.max(0, Date.now() - startedAt),
        environment: options.env.NODE_ENV,
        level: "info",
        method: request.method,
        path: request.path,
        requestId: getRequestIdFromLocals(response),
        service: options.env.SERVICE_NAME,
        statusCode: response.statusCode,
        time: options.now().toISOString()
      });
    });

    next();
  };
}

function getRequestIdFromLocals(response: Response): string {
  const requestId = response.locals.requestId;

  if (typeof requestId === "string" && requestId.length > 0) {
    return requestId;
  }

  return "unknown";
}
