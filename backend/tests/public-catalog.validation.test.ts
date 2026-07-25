import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  normalizeTags,
  parseCategoryDetailQuery,
  parseCategoryListQuery,
  parsePopularSitesQuery,
  parseSiteListQuery,
  parseSlugParam
} from "../src/modules/public-catalog/public-catalog.schemas.js";

function expectValidationError(action: () => unknown, path: string): void {
  expect(action).toThrow(AppError);

  try {
    action();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Invalid request.");
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path })
      ])
    );
  }
}

describe("public catalog request validation", () => {
  it("parses default GET /api/sites query values", () => {
    expect(parseSiteListQuery({})).toEqual({
      limit: 12,
      page: 1,
      sort: "sortOrder",
      tags: []
    });
  });

  it("normalizes GET /api/sites query strings", () => {
    expect(
      parseSiteListQuery({
        category: "goods",
        limit: "20",
        page: "2",
        search: "  Landing  ",
        sort: "popular",
        tags: " Design,design,  speed ,,Seo "
      })
    ).toEqual({
      category: "goods",
      limit: 20,
      page: 2,
      search: "Landing",
      sort: "popular",
      tags: ["design", "speed", "seo"]
    });
  });

  it("rejects unknown query fields strictly", () => {
    expectValidationError(() => parseSiteListQuery({ preview: "1" }), "preview");
  });

  it("rejects invalid page, limit, search, sort, and tag boundaries", () => {
    expectValidationError(() => parseSiteListQuery({ page: "0" }), "page");
    expectValidationError(() => parseSiteListQuery({ limit: "21" }), "limit");
    expectValidationError(() => parseSiteListQuery({ search: "x".repeat(101) }), "search");
    expectValidationError(() => parseSiteListQuery({ sort: "views" }), "sort");
    expectValidationError(() => parseSiteListQuery({ tags: "a,b,c,d,e,f,g,h,i,j,k" }), "tags");
  });

  it("normalizes tags by trimming, lowercasing, removing empties, and removing duplicates", () => {
    expect(normalizeTags(" Alpha, beta,,ALPHA,  гамма ")).toEqual(["alpha", "beta", "гамма"]);
  });

  it("parses popular sites query defaults and rejects unknown fields", () => {
    expect(parsePopularSitesQuery({})).toEqual({ limit: 6 });
    expect(parsePopularSitesQuery({ category: "goods", limit: "3" })).toEqual({
      category: "goods",
      limit: 3
    });
    expectValidationError(() => parsePopularSitesQuery({ page: "1" }), "page");
  });

  it("parses category list and category detail query values", () => {
    expect(parseCategoryListQuery({})).toEqual({ includeCounts: false });
    expect(parseCategoryListQuery({ includeCounts: "true" })).toEqual({ includeCounts: true });
    expect(parseCategoryDetailQuery({ includeSites: "true", limit: "5", page: "3", sort: "title" })).toEqual({
      includeSites: true,
      limit: 5,
      page: 3,
      sort: "title"
    });
  });

  it("rejects invalid boolean values and validates slugs", () => {
    expectValidationError(() => parseCategoryListQuery({ includeCounts: "yes" }), "includeCounts");
    expectValidationError(() => parseCategoryDetailQuery({ includeSites: "1" }), "includeSites");
    expect(parseSlugParam({ slug: "site-custom" }, "slug")).toBe("site-custom");
    expectValidationError(() => parseSlugParam({ slug: "Popular!" }, "slug"), "slug");
  });
});
