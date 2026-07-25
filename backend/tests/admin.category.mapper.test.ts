import { describe, expect, it } from "vitest";
import { mapAdminCategoryDetail } from "../src/modules/admin/categories/category.mapper.js";

describe("admin category mapper", () => {
  it("includes editor category id and omits admin-only fields", () => {
    const mapped = mapAdminCategoryDetail(
      {
        active: true,
        createdAt: new Date("2026-07-25T00:00:00.000Z"),
        description: null,
        id: "00000000-0000-4000-8000-000000000001",
        siteCount: 3,
        slug: "category",
        sortOrder: 10,
        title: "Category",
        updatedAt: new Date("2026-07-25T00:00:00.000Z")
      },
      "editor"
    );

    expect(mapped).toEqual({
      description: null,
      id: "00000000-0000-4000-8000-000000000001",
      siteCount: 3,
      slug: "category",
      sortOrder: 10,
      title: "Category"
    });
  });
});
