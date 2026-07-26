import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  parseGalleryDeleteParams,
  parseGalleryReorderInput,
  parseSiteImageParams
} from "../src/modules/admin/images/site-image.schemas.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

describe("site image validation", () => {
  it("accepts strict site image route params", () => {
    expect(parseSiteImageParams({ id: siteId })).toEqual({ id: siteId });
    expect(parseGalleryDeleteParams({ assetId, id: siteId })).toEqual({
      assetId,
      id: siteId
    });
  });

  it("rejects malformed or extra route params", () => {
    expect(() => parseSiteImageParams({ id: "not-a-uuid" })).toThrow(AppError);
    expect(() => parseSiteImageParams({ extra: true, id: siteId })).toThrow(
      AppError
    );
    expect(() => parseGalleryDeleteParams({ assetId: "bad", id: siteId })).toThrow(
      AppError
    );
  });

  it("accepts bounded gallery reorder payloads", () => {
    expect(
      parseGalleryReorderInput({
        items: [{ alt: "  Trim me  ", assetId, sortOrder: 0 }]
      })
    ).toEqual({
      items: [{ alt: "Trim me", assetId, sortOrder: 0 }]
    });
  });

  it("rejects invalid gallery reorder payloads", () => {
    expect(() =>
      parseGalleryReorderInput({ items: [{ assetId, sortOrder: 1.25 }] })
    ).toThrow(AppError);
    expect(() =>
      parseGalleryReorderInput({
        items: Array.from({ length: 21 }, (_, index) => ({
          assetId,
          sortOrder: index
        }))
      })
    ).toThrow(AppError);
  });
});
