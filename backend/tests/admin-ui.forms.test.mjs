import { describe, expect, it } from "vitest";

import {
  buildCreateSitePayload,
  buildUpdateSitePayload,
  formatCentsToRubles,
  generateSiteSlug,
  mapValidationDetails,
  normalizeSlug,
  parseRublesToCents,
  serializeNullableText,
  serializeNonNegativeInteger,
  serializeOptionalUrl,
  serializePositiveInteger,
  serializeStringList
} from "../src/admin/assets/forms.js";

describe("admin site form utilities", () => {
  it("generates human-friendly latin slugs from Russian titles", () => {
    expect(generateSiteSlug("Магазин одежды — тест")).toBe("magazin-odezhdy-test");
    expect(generateSiteSlug("Сайт салона красоты")).toBe("sait-salona-krasoty");
    expect(generateSiteSlug("  CRM + AI!!! 2026  ")).toBe("crm-ai-2026");
    expect(generateSiteSlug("---")).toBe("site");
    expect(generateSiteSlug("Очень длинный заголовок ".repeat(12)).length).toBeLessThanOrEqual(120);
    expect(generateSiteSlug("Магазин---одежды")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("parses ruble prices to cents without floating point math", () => {
    expect(parseRublesToCents("15000", "priceRubles")).toBe(1500000);
    expect(parseRublesToCents("15000,50", "priceRubles")).toBe(1500050);
    expect(parseRublesToCents("15 000", "priceRubles")).toBe(1500000);
    expect(parseRublesToCents("", "priceRubles")).toBeNull();
    expect(formatCentsToRubles(1500050)).toBe("15000,50");
    expect(formatCentsToRubles(1500000)).toBe("15000");

    expectValidationError(() => parseRublesToCents("-1", "priceRubles"), {
      details: [{ message: "Введите цену в рублях без минуса.", path: "priceRubles" }]
    });
    expectValidationError(() => parseRublesToCents("12,345", "priceRubles"), {
      details: [{ message: "Цена может содержать не больше двух знаков после запятой.", path: "priceRubles" }]
    });
    expectValidationError(() => parseRublesToCents("12 abc", "priceRubles"), {
      details: [{ message: "Введите цену в рублях: например 15000 или 15000,50.", path: "priceRubles" }]
    });
    expectValidationError(() => parseRublesToCents("21474836,48", "priceRubles"), {
      details: [{ message: "Цена слишком большая для сохранения.", path: "priceRubles" }]
    });
  });

  it("normalizes nullable text, numbers, slugs, arrays, and URLs", () => {
    expect(serializeNullableText("   ", 80)).toBeNull();
    expect(serializeNullableText("  WEB00  ", 80)).toBe("WEB00");
    expect(serializePositiveInteger("42", "developmentDays")).toBe(42);
    expect(serializePositiveInteger("", "developmentDays")).toBeNull();
    expect(serializeNonNegativeInteger("0", "sortOrder")).toBe(0);
    expect(normalizeSlug("  My-Site-01  ")).toBe("my-site-01");
    expect(serializeStringList(["  Fast ", "", "Safe"], {
      fieldName: "features",
      maxItems: 30,
      maxLength: 160
    })).toEqual(["Fast", "Safe"]);
    expect(serializeOptionalUrl(" https://example.test/demo ")).toBe(
      "https://example.test/demo"
    );
    expect(serializeOptionalUrl("")).toBeNull();
  });

  it("rejects invalid required values with field-specific details", () => {
    expectValidationError(() => normalizeSlug("bad slug"), {
      details: [{ message: "Slug must use lowercase letters, numbers, and hyphens.", path: "slug" }]
    });
    expectValidationError(() => serializePositiveInteger("0", "priceAmountCents"), {
      details: [{ message: "Must be a positive integer.", path: "priceAmountCents" }]
    });
    expectValidationError(() => serializeStringList(Array.from({ length: 31 }, (_, index) => `f-${index}`), {
      fieldName: "features",
      maxItems: 30,
      maxLength: 160
    }), {
      details: [{ message: "Must contain at most 30 items.", path: "features" }]
    });
    expectValidationError(() => serializeOptionalUrl("javascript:alert(1)"), {
      details: [{ message: "Must be a valid http or https URL.", path: "url" }]
    });
    expectValidationError(() => serializePositiveInteger("2147483648", "priceAmountCents"), {
      details: [{ message: "Must be at most 2147483647.", path: "priceAmountCents" }]
    });
    expectValidationError(() => serializeNonNegativeInteger("2147483648", "sortOrder"), {
      details: [{ message: "Must be at most 2147483647.", path: "sortOrder" }]
    });
  });

  it("builds exact create draft payloads and omits unknown or protected fields", () => {
    const payload = buildCreateSitePayload({
      active: true,
      categoryId: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-28T00:00:00.000Z",
      deletedAt: "2026-07-28T00:00:00.000Z",
      developmentDays: "5",
      featured: true,
      features: ["A", " ", "B"],
      galleryImages: [{ url: "x" }],
      id: "site-1",
      previewImageUrl: "preview.png",
      priceRubles: "1 200,50",
      shortDescription: "  Short  ",
      slug: "  New-Site  ",
      sortOrder: "0",
      status: "published",
      tags: ["cms", ""],
      title: "  Новый сайт  ",
      unknown: "drop-me",
      updatedAt: "2026-07-28T00:00:00.000Z",
      views: 10
    });

    expect(payload).toEqual({
      categoryId: "00000000-0000-4000-8000-000000000001",
      developmentDays: 5,
      features: ["A", "B"],
      priceAmountCents: 120050,
      shortDescription: "Short",
      slug: "new-site",
      sortOrder: 0,
      tags: ["cms"],
      title: "Новый сайт"
    });
    expect(payload).not.toHaveProperty("active");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("previewImageUrl");
    expect(payload).not.toHaveProperty("galleryImages");
  });

  it("maps one simple external demo URL to the current backend URL contract", () => {
    expect(buildCreateSitePayload({
      categoryId: "00000000-0000-4000-8000-000000000001",
      demoMode: "external-iframe",
      demoUrlSimple: " https://demo.example.test/path ",
      shortDescription: "Short",
      slug: "demo-site",
      title: "Demo Site"
    })).toMatchObject({
      demoMode: "external-iframe",
      demoUrl: "https://demo.example.test/path",
      externalDemoUrl: "https://demo.example.test/path",
      originalDemoUrl: "https://demo.example.test/path"
    });

    expect(buildCreateSitePayload({
      categoryId: "00000000-0000-4000-8000-000000000001",
      demoMode: "none",
      demoUrlSimple: "",
      shortDescription: "Short",
      slug: "no-demo-site",
      title: "No Demo Site"
    })).toMatchObject({
      demoMode: "none",
      demoUrl: null,
      externalDemoUrl: null,
      originalDemoUrl: null
    });
  });

  it("keeps editor update payloads away from admin-only and protected fields", () => {
    const editorPayload = buildUpdateSitePayload({
      active: false,
      featured: true,
      previewImageUrl: "preview.png",
      shortDescription: "Editor update",
      slug: "editor-slug",
      title: "Editor title",
      views: 5
    }, "editor");
    const adminPayload = buildUpdateSitePayload({
      featured: true,
      shortDescription: "Admin update",
      slug: "admin-slug",
      title: "Admin title"
    }, "admin");

    expect(editorPayload).toEqual({
      shortDescription: "Editor update",
      title: "Editor title"
    });
    expect(adminPayload).toEqual({
      featured: true,
      shortDescription: "Admin update",
      slug: "admin-slug",
      title: "Admin title"
    });
  });

  it("maps backend validation details to form fields", () => {
    expect(mapValidationDetails([
      { message: "Required", path: "title" },
      { message: "Conflict", path: "slug" },
      { message: "Global" }
    ])).toEqual({
      _form: ["Global"],
      slug: ["Conflict"],
      title: ["Required"]
    });
  });
});

function expectValidationError(action, expected) {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({
      code: "FORM_VALIDATION_ERROR",
      ...expected
    });
    return;
  }

  throw new Error("Expected form validation error.");
}
