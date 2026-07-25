import { describe, expect, it } from "vitest";
import {
  parseCreateAdminSiteInput,
  parseUpdateAdminSiteInput
} from "../src/modules/admin/sites/site.schemas.js";

const baseCreate = {
  categoryId: "00000000-0000-4000-8000-000000000001",
  shortDescription: "Short description",
  slug: "admin-site",
  title: "Admin Site"
};

describe("admin site validation", () => {
  it("rejects featured in create requests for every role", () => {
    expect(() => parseCreateAdminSiteInput({ ...baseCreate, featured: true })).toThrow(
      "Invalid request."
    );
  });

  it("rejects lifecycle fields and unknown fields in generic patch", () => {
    expect(() => parseUpdateAdminSiteInput({ status: "published" }, "admin")).toThrow(
      "Invalid request."
    );
    expect(() => parseUpdateAdminSiteInput({ unknown: true }, "editor")).toThrow(
      "Invalid request."
    );
  });

  it("allows featured only in admin patch and never in editor patch", () => {
    expect(parseUpdateAdminSiteInput({ featured: true }, "admin")).toEqual({
      featured: true
    });
    expect(() => parseUpdateAdminSiteInput({ featured: true }, "editor")).toThrow(
      "Invalid request."
    );
  });
});
