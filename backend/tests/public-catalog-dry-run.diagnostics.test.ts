import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  createPublicCatalogDryRunBlocker,
  mapUnexpectedPublicCatalogDryRunFailure,
  sortAndLimitPublicCatalogDryRunBlockers
} from "../src/modules/public-catalog/public-catalog-dry-run.diagnostics.js";

describe("public catalog dry-run diagnostics", () => {
  it("sorts all blockers before truncating to 100 safe entries", () => {
    const blockers = Array.from({ length: 105 }, (_unused, index) =>
      createPublicCatalogDryRunBlocker({
        errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED",
        fieldPath: index % 2 === 0 ? "previewImage.url" : "galleryImages[0].url",
        itemIndex: 104 - index,
        reasonCode: "INVALID_URL_CREDENTIALS",
        siteId: `site-${104 - index}`,
        slug: `slug-${104 - index}`,
        stage: "item_validate"
      })
    );

    const result = sortAndLimitPublicCatalogDryRunBlockers(blockers);

    expect(result.blockers).toHaveLength(100);
    expect(result.blockersTruncated).toBe(true);
    expect(result.blockers[0]).toMatchObject({
      itemIndex: 0,
      reasonCode: "INVALID_URL_CREDENTIALS",
      stage: "item_validate"
    });
    expect(JSON.stringify(result)).not.toMatch(/postgres:\/\/|service_role|token=|password|secret|user:pass/i);
  });

  it("maps unexpected failures to safe AppError instead of blocker results", () => {
    const error = mapUnexpectedPublicCatalogDryRunFailure(
      new Error("raw provider response postgres://user:pass@host/db token=secret")
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "PUBLIC_CATALOG_DRY_RUN_FAILED",
      statusCode: 500
    });
    expect(JSON.stringify(error)).not.toMatch(/provider response|user:pass|token=secret/i);
  });
});
