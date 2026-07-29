import type {
  AppLogger,
  SiteCreateDraftFailedLogEntry
} from "../../../lib/logger.js";

export const SITE_CREATE_DRAFT_STAGES = [
  "CATEGORY_LOOKUP_STARTED",
  "CATEGORY_LOOKUP_COMPLETED",
  "SITE_INSERT_STARTED",
  "SITE_INSERT_COMPLETED",
  "AUDIT_INSERT_STARTED",
  "AUDIT_INSERT_COMPLETED",
  "TRANSACTION_COMMIT_PENDING",
  "REQUEST_COMPLETED"
] as const;

export type SiteCreateDraftStage = (typeof SITE_CREATE_DRAFT_STAGES)[number];
export type { SiteCreateDraftFailedLogEntry } from "../../../lib/logger.js";

export interface SiteCreateDraftDiagnostics {
  environment: string;
  logger: AppLogger;
  now: () => Date;
  service: string;
}

const safeErrorClassPattern = /^[A-Za-z][A-Za-z0-9_]{0,119}$/;
const prismaCodePattern = /^P[0-9]{4}$/;

export function reportSiteCreateDraftFailure(
  diagnostics: SiteCreateDraftDiagnostics | undefined,
  input: {
    elapsedMs: number;
    error: unknown;
    requestId: string;
    stage: SiteCreateDraftStage;
    transactionCallbackCompleted: boolean;
  }
): void {
  if (diagnostics === undefined) {
    return;
  }

  try {
    diagnostics.logger.log(
      createSiteCreateDraftFailedLogEntry({
        elapsedMs: input.elapsedMs,
        environment: diagnostics.environment,
        error: input.error,
        requestId: input.requestId,
        service: diagnostics.service,
        stage: input.stage,
        time: diagnostics.now(),
        transactionCallbackCompleted: input.transactionCallbackCompleted
      })
    );
  } catch {
    return;
  }
}

export function createSiteCreateDraftFailedLogEntry(input: {
  elapsedMs: number;
  environment: string;
  error: unknown;
  requestId: string;
  service: string;
  stage: SiteCreateDraftStage;
  time: Date;
  transactionCallbackCompleted: boolean;
}): SiteCreateDraftFailedLogEntry {
  return {
    elapsedMs: normalizeElapsedMs(input.elapsedMs),
    environment: input.environment,
    errorClass: readErrorClass(input.error),
    event: "site.create_draft.failed",
    level: "error",
    prismaCode: readPrismaCode(input.error),
    requestId: input.requestId,
    service: input.service,
    stage: input.stage,
    time: input.time.toISOString(),
    transactionCallbackCompleted: input.transactionCallbackCompleted
  };
}

function readErrorClass(error: unknown): string {
  if (!isRecord(error)) {
    return "UnknownError";
  }

  return (
    readSafeErrorClass(error.name) ??
    readSafeErrorClass((error as { constructor?: { name?: unknown } }).constructor?.name) ??
    "UnknownError"
  );
}

function readPrismaCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  const code = error.code;

  return typeof code === "string" && prismaCodePattern.test(code) ? code : null;
}

function readSafeErrorClass(value: unknown): string | undefined {
  if (typeof value !== "string" || !safeErrorClassPattern.test(value)) {
    return undefined;
  }

  return value;
}

function normalizeElapsedMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
