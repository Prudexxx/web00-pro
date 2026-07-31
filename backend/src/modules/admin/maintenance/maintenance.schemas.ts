import { AppError } from "../../../lib/errors.js";
import { CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION } from "../sites/canonical-asset-reconciliation.js";
import type { AdminCanonicalAssetsApplyInput } from "./maintenance.service.js";

export function parseCanonicalAssetsApplyInput(
  body: unknown
): AdminCanonicalAssetsApplyInput {
  const source = isRecord(body) ? body : {};
  const confirmation = source.confirmation;

  if (confirmation !== CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      details: [
        {
          message: "Must match the canonical asset reconciliation confirmation text.",
          path: "confirmation"
        }
      ],
      message: "Invalid canonical asset reconciliation confirmation.",
      statusCode: 400
    });
  }

  return {
    confirmation
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
