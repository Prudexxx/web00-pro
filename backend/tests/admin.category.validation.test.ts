import { describe, expect, it } from "vitest";
import {
  parseCreateAdminCategoryInput,
  parseUpdateAdminCategoryInput
} from "../src/modules/admin/categories/category.schemas.js";

describe("admin category validation", () => {
  it("rejects empty patch and unknown fields", () => {
    expect(() => parseUpdateAdminCategoryInput({})).toThrow("Invalid request.");
    expect(() => parseUpdateAdminCategoryInput({ unknown: true })).toThrow(
      "Invalid request."
    );
  });

  it("normalizes create input", () => {
    expect(
      parseCreateAdminCategoryInput({
        active: true,
        description: " Description ",
        slug: "new-category",
        sortOrder: 5,
        title: " Category "
      })
    ).toEqual({
      active: true,
      description: "Description",
      slug: "new-category",
      sortOrder: 5,
      title: "Category"
    });
  });
});
