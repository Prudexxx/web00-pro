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
const int32Max = 2_147_483_647;

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

  it("rejects image fields in generic create and patch requests", () => {
    expect(() =>
      parseCreateAdminSiteInput({
        ...baseCreate,
        previewImageUrl: "https://storage.example.test/preview.webp"
      })
    ).toThrow("Invalid request.");
    expect(() =>
      parseCreateAdminSiteInput({
        ...baseCreate,
        galleryImages: []
      })
    ).toThrow("Invalid request.");
    expect(() =>
      parseUpdateAdminSiteInput(
        { previewImageUrl: "https://storage.example.test/preview.webp" },
        "admin"
      )
    ).toThrow("Invalid request.");
    expect(() => parseUpdateAdminSiteInput({ galleryImages: [] }, "admin")).toThrow(
      "Invalid request."
    );
  });

  it("rejects unsupported demo modes before database constraints", () => {
    expectValidationDetail(() =>
      parseCreateAdminSiteInput({
        ...baseCreate,
        demoMode: "iframe"
      })
    , {
      message: "Выберите допустимый режим демо.",
      path: "demoMode"
    });
    expectValidationDetail(() =>
      parseUpdateAdminSiteInput({ demoMode: "external" }, "admin")
    , {
      message: "Выберите допустимый режим демо.",
      path: "demoMode"
    });
  });

  it("accepts only approved demo modes and normalizes empty mode to null", () => {
    expect(parseCreateAdminSiteInput({ ...baseCreate, demoMode: "none" })).toMatchObject({
      demoMode: "none"
    });
    expect(
      parseCreateAdminSiteInput({ ...baseCreate, demoMode: "external-iframe" })
    ).toMatchObject({
      demoMode: "external-iframe"
    });
    expect(parseCreateAdminSiteInput({ ...baseCreate, demoMode: "" })).toMatchObject({
      demoMode: null
    });
    expect(parseUpdateAdminSiteInput({ demoMode: null }, "admin")).toEqual({
      demoMode: null
    });
  });

  it("rejects integer overflow before PostgreSQL integer constraints", () => {
    for (const path of ["priceAmountCents", "developmentDays", "sortOrder"] as const) {
      expectValidationDetail(() =>
        parseCreateAdminSiteInput({
          ...baseCreate,
          [path]: int32Max + 1
        })
      , {
        message: "Must be at most 2147483647.",
        path
      });
      expectValidationDetail(() =>
        parseUpdateAdminSiteInput({ [path]: int32Max + 1 }, "admin")
      , {
        message: "Must be at most 2147483647.",
        path
      });
    }

    expect(
      parseCreateAdminSiteInput({
        ...baseCreate,
        developmentDays: int32Max,
        priceAmountCents: int32Max,
        sortOrder: int32Max
      })
    ).toMatchObject({
      developmentDays: int32Max,
      priceAmountCents: int32Max,
      sortOrder: int32Max
    });
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

function expectValidationDetail(
  action: () => unknown,
  expected: { message: string; path: string }
): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [expected],
      message: "Invalid request."
    });
    return;
  }

  throw new Error(`Expected validation error for ${expected.path}.`);
}
