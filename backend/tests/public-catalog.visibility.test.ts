import { describe, expect, it } from "vitest";
import {
  publicCategoryVisibilityWhere,
  publicSiteVisibilityWhere,
  PUBLIC_CATEGORY_VISIBILITY_WHERE,
  PUBLIC_SITE_VISIBILITY_WHERE
} from "../src/modules/public-catalog/public-catalog.visibility.js";

describe("public catalog visibility guard", () => {
  it("centralizes the public site visibility guard", () => {
    expect(PUBLIC_SITE_VISIBILITY_WHERE).toEqual({
      active: true,
      deletedAt: null,
      status: "published"
    });
    expect(publicSiteVisibilityWhere()).toEqual(PUBLIC_SITE_VISIBILITY_WHERE);
  });

  it("centralizes the public category visibility guard", () => {
    expect(PUBLIC_CATEGORY_VISIBILITY_WHERE).toEqual({ active: true });
    expect(publicCategoryVisibilityWhere()).toEqual(PUBLIC_CATEGORY_VISIBILITY_WHERE);
  });

  it("returns cloned guard objects so callers cannot mutate the canonical guard", () => {
    const siteWhere = publicSiteVisibilityWhere() as { active: boolean; status: string };
    const categoryWhere = publicCategoryVisibilityWhere() as { active: boolean };

    siteWhere.active = false;
    siteWhere.status = "draft";
    categoryWhere.active = false;

    expect(publicSiteVisibilityWhere()).toEqual({
      active: true,
      deletedAt: null,
      status: "published"
    });
    expect(publicCategoryVisibilityWhere()).toEqual({ active: true });
  });
});
