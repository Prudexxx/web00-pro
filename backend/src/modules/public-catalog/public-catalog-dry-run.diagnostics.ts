import { AppError } from "../../lib/errors.js";
import type {
  PublicCatalogDryRunBlocker,
  PublicCatalogDryRunReasonCode,
  PublicCatalogDryRunStage
} from "./public-catalog-dry-run.types.js";

const maxPublicCatalogDryRunBlockers = 100;

export interface PublicCatalogDryRunBlockerInput {
  errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED";
  fieldPath: string | null;
  itemIndex: number | null;
  reasonCode: PublicCatalogDryRunReasonCode;
  siteId: string | null;
  slug: string | null;
  stage: PublicCatalogDryRunStage;
}

export class PublicCatalogDryRunDataError extends Error {
  public readonly blocker: PublicCatalogDryRunBlocker;

  public constructor(input: Omit<PublicCatalogDryRunBlockerInput, "errorCode">) {
    super("Public catalog dry-run blocked by public data.");
    this.name = "PublicCatalogDryRunDataError";
    this.blocker = createPublicCatalogDryRunBlocker({
      ...input,
      errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED"
    });
  }
}

export function createPublicCatalogDryRunBlocker(
  input: PublicCatalogDryRunBlockerInput
): PublicCatalogDryRunBlocker {
  return {
    errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED",
    fieldPath: normalizeOptionalString(input.fieldPath),
    itemIndex:
      typeof input.itemIndex === "number" && Number.isSafeInteger(input.itemIndex)
        ? input.itemIndex
        : null,
    reasonCode: input.reasonCode,
    siteId: normalizeOptionalString(input.siteId),
    slug: normalizeOptionalString(input.slug),
    stage: input.stage
  };
}

export function createPublicCatalogDryRunDataError(
  input: Omit<PublicCatalogDryRunBlockerInput, "errorCode">
): PublicCatalogDryRunDataError {
  return new PublicCatalogDryRunDataError(input);
}

export function sortAndLimitPublicCatalogDryRunBlockers(
  blockers: readonly PublicCatalogDryRunBlocker[]
): { blockers: PublicCatalogDryRunBlocker[]; blockersTruncated: boolean } {
  const sorted = [...blockers].sort(comparePublicCatalogDryRunBlockers);

  return {
    blockers: sorted.slice(0, maxPublicCatalogDryRunBlockers),
    blockersTruncated: sorted.length > maxPublicCatalogDryRunBlockers
  };
}

export function mapUnexpectedPublicCatalogDryRunFailure(_error: unknown): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_DRY_RUN_FAILED",
    message: "Public catalog dry-run failed.",
    statusCode: 500
  });
}

export function safePublicCatalogDryRunErrorClass(error: unknown): string {
  const value =
    error instanceof Error
      ? error.name || error.constructor.name
      : typeof error === "object" && error !== null
        ? "NonErrorObject"
        : "NonError";

  return /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(value) ? value : "Error";
}

function comparePublicCatalogDryRunBlockers(
  left: PublicCatalogDryRunBlocker,
  right: PublicCatalogDryRunBlocker
): number {
  return (
    compareNullableNumber(left.itemIndex, right.itemIndex) ||
    compareNullableString(left.fieldPath, right.fieldPath) ||
    left.reasonCode.localeCompare(right.reasonCode) ||
    compareNullableString(left.siteId, right.siteId) ||
    compareNullableString(left.slug, right.slug)
  );
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function compareNullableString(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function normalizeOptionalString(value: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
