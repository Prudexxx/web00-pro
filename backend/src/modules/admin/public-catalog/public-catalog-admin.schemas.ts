import { AppError, type ErrorDetail } from "../../../lib/errors.js";

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

function validationError(path: string, message: string): AppError {
  const details: ErrorDetail[] = [{ message, path }];

  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
