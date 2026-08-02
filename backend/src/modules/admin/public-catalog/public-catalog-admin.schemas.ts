import { AppError, type ErrorDetail } from "../../../lib/errors.js";

export const PUBLIC_CATALOG_SYNC_CONFIRMATION = "WEB00-PUBLIC-CATALOG-SYNC-V1";
export const PUBLIC_CATALOG_DRY_RUN_CONFIRMATION = "WEB00-PUBLIC-CATALOG-DRY-RUN-V1";

export function parsePublicCatalogSettingsInput(input: unknown): {
  showDemoInModal: boolean;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validationError("body", "Must be an object.");
  }

  const value = (input as Record<string, unknown>).showDemoInModal;

  if (typeof value !== "boolean") {
    throw validationError("showDemoInModal", "Must be true or false.");
  }

  return { showDemoInModal: value };
}

export function parsePublicCatalogSyncInput(input: unknown): {
  confirmation: typeof PUBLIC_CATALOG_SYNC_CONFIRMATION;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validationError("body", "Must be an object.");
  }

  const value = (input as Record<string, unknown>).confirmation;
  if (value !== PUBLIC_CATALOG_SYNC_CONFIRMATION) {
    throw validationError("confirmation", "Must match the public catalog sync confirmation.");
  }

  return { confirmation: PUBLIC_CATALOG_SYNC_CONFIRMATION };
}

export function parsePublicCatalogDryRunInput(input: unknown): {
  confirmation: typeof PUBLIC_CATALOG_DRY_RUN_CONFIRMATION;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validationError("body", "Must be an object.");
  }

  const value = (input as Record<string, unknown>).confirmation;
  if (value !== PUBLIC_CATALOG_DRY_RUN_CONFIRMATION) {
    throw validationError("confirmation", "Must match the public catalog dry-run confirmation.");
  }

  return { confirmation: PUBLIC_CATALOG_DRY_RUN_CONFIRMATION };
}

function validationError(path: string, message: string): AppError {
  const details: ErrorDetail[] = [{ message, path }];

  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
