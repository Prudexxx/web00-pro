import { describe, expect, it, vi } from "vitest";

import { buildCategoryCreatePayload, createCategoriesScreen } from "../src/admin/assets/screens/categories.js";
import { createAuditScreen } from "../src/admin/assets/screens/audit.js";
import {
  buildCreateSitePayload,
  buildUpdateSitePayload
} from "../src/admin/assets/forms.js";
import {
  buildGalleryReorderPayload,
  createImageManagerScreen
} from "../src/admin/assets/screens/image-manager.js";
import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";
import { createUsersScreen } from "../src/admin/assets/screens/users.js";
import { createFakeDocument } from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin UI browser form constraints", () => {
  it("uses maxlength for site text controls and keeps numeric constraints numeric", async () => {
    const documentRef = createFakeDocument();
    const screen = createSiteEditorScreen({
      apiClient: {
        requestJson: vi.fn(() => Promise.resolve({ data: [categoryFixture()] }))
      },
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expectTextLimit(screen.element, "slug", "120");
    expectTextLimit(screen.element, "title", "160");
    expectTextLimit(screen.element, "shortDescription", "500");
    expectTextLimit(screen.element, "fullDescription", "5000");
    expectTextLimit(screen.element, "legacyTitle", "160");
    expectTextLimit(screen.element, "deliveryLabel", "80");
    expectTextLimit(screen.element, "priceLabel", "80");
    expectSelectOptions(screen.element, "demoMode", ["none", "external-iframe"]);
    expectTextLimit(screen.element, "demoUrlSimple", "2048");
    expectTextLimit(screen.element, "previewType", "40");
    expect(screen.element.querySelector('[data-section="advanced-site-settings"]').tagName).toBe("details");
    expect(screen.element.querySelector('[data-section="advanced-site-settings"]').getAttribute("open")).toBeNull();
    for (const name of ["demoUrl", "demoLocalUrl", "externalDemoUrl", "originalDemoUrl", "siteUrl"]) {
      expectTextLimit(screen.element, name, "2048");
    }
    expectItemLimit(screen.element, "features", "160", "30");
    expectItemLimit(screen.element, "tags", "80", "30");
    expectDecimalMoney(screen.element, "priceRubles");
    expectNumeric(screen.element, "developmentDays", { inputmode: "numeric", step: "1" });
    expectNumeric(screen.element, "sortOrder", { inputmode: "numeric", min: "0", step: "1" });
  });

  it("uses maxlength for category, user, audit, and image text controls", async () => {
    const categoryDocument = createFakeDocument();
    const categoryScreen = createCategoriesScreen({
      apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [], meta: metaFixture() })) },
      documentRef: categoryDocument,
      onStatus: vi.fn(),
      role: "admin"
    });
    await categoryScreen.load();
    expectTextLimit(categoryScreen.element, "categorySearch", "100");
    expectTextLimit(categoryScreen.element, "categorySlug", "120");
    expectTextLimit(categoryScreen.element, "categoryTitle", "120");
    expectTextLimit(categoryScreen.element, "categoryDescription", "1000");
    expectNumeric(categoryScreen.element, "categoryPage", { inputmode: "numeric", min: "1", step: "1" });
    expectNumeric(categoryScreen.element, "categoryLimit", { inputmode: "numeric", max: "100", min: "1", step: "1" });
    expectNumeric(categoryScreen.element, "categorySortOrder", { inputmode: "numeric", min: "0", step: "1" });

    const userDocument = createFakeDocument();
    const usersScreen = createUsersScreen({
      apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [], meta: metaFixture() })) },
      currentUser: adminUser(),
      documentRef: userDocument,
      onStatus: vi.fn(),
      role: "admin"
    });
    await usersScreen.load();
    expectTextLimit(usersScreen.element, "userSearch", "100");
    expectNumeric(usersScreen.element, "userPage", { inputmode: "numeric", min: "1", step: "1" });
    expectNumeric(usersScreen.element, "userLimit", { inputmode: "numeric", max: "100", min: "1", step: "1" });

    const auditDocument = createFakeDocument();
    const auditScreen = createAuditScreen({
      apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [], meta: metaFixture() })) },
      documentRef: auditDocument,
      onStatus: vi.fn(),
      role: "admin"
    });
    await auditScreen.load();
    expectTextLimit(auditScreen.element, "auditAction", "80");
    expectNumeric(auditScreen.element, "auditPage", { inputmode: "numeric", min: "1", step: "1" });
    expectNumeric(auditScreen.element, "auditLimit", { inputmode: "numeric", max: "100", min: "1", step: "1" });

    const imageDocument = createFakeDocument();
    const imageScreen = createImageManagerScreen({
      apiClient: {
        requestJson: vi.fn(() => Promise.resolve({ data: siteFixture() })),
        requestMultipart: vi.fn()
      },
      documentRef: imageDocument,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "admin",
      siteId: siteFixture().id
    });
    await imageScreen.load();
    for (const name of ["previewAlt", "galleryAlt", "galleryBatchAlt"]) {
      expectTextLimit(imageScreen.element, name, "160");
    }
  });

  it("does not use text max attributes and still rejects programmatic overlength values", () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("section");
    const textInput = documentRef.createElement("input");
    const numberInput = documentRef.createElement("input");
    textInput.setAttribute("type", "text");
    numberInput.setAttribute("type", "number");
    numberInput.setAttribute("max", "100");
    root.append(textInput, numberInput);

    for (const control of findControls(root)) {
      if (control.getAttribute("type") !== "number") {
        expect(control.getAttribute("max")).toBeNull();
      }
    }

    expectValidationPath(() => buildCreateSitePayload({
      categoryId: categoryFixture().id,
      shortDescription: "x".repeat(501),
      slug: "demo",
      title: "Demo"
    }), "shortDescription");
    expectValidationPath(() => buildUpdateSitePayload({
      fullDescription: "x".repeat(5001)
    }, "admin"), "fullDescription");
    expectValidationPath(() => buildCategoryCreatePayload({
      description: "x".repeat(1001),
      slug: "ops",
      title: "Ops"
    }), "description");
    expect(() => buildGalleryReorderPayload([{
      alt: "x".repeat(161),
      assetId: "00000000-0000-4000-8000-000000000201",
      sortOrder: 0
    }])).toThrow(/160/);
  });
});

function expectTextLimit(root, name, maxlength) {
  const control = field(root, name);
  expect(control.getAttribute("maxlength")).toBe(maxlength);
  expect(control.getAttribute("max")).toBeNull();
}

function expectItemLimit(root, name, itemMaxlength, maxItems) {
  const control = field(root, name);
  expect(control.getAttribute("data-item-maxlength")).toBe(itemMaxlength);
  expect(control.getAttribute("data-max-items")).toBe(maxItems);
  expect(control.getAttribute("maxlength")).not.toBeNull();
  expect(control.getAttribute("max")).toBeNull();
}

function expectNumeric(root, name, expected) {
  const control = field(root, name);
  expect(control.getAttribute("type")).toBe("number");
  expect(control.getAttribute("step")).toBe(expected.step);
  expect(control.getAttribute("inputmode")).toBe(expected.inputmode);
  if (expected.min !== undefined) {
    expect(control.getAttribute("min")).toBe(expected.min);
  }
  if (expected.max !== undefined) {
    expect(control.getAttribute("max")).toBe(expected.max);
  }
}

function expectDecimalMoney(root, name) {
  const control = field(root, name);
  expect(control.getAttribute("type")).toBe("text");
  expect(control.getAttribute("inputmode")).toBe("decimal");
  expect(control.getAttribute("maxlength")).toBe("20");
}

function expectSelectOptions(root, name, values) {
  const control = field(root, name);
  expect(control.tagName).toBe("select");
  expect(control.getAttribute("type")).toBeNull();
  expect(control.querySelectorAll("option").map((option) => option.getAttribute("value"))).toEqual(values);
}

function field(root, name) {
  const control = root.querySelector(`[name="${name}"]`);
  if (control === null) {
    throw new Error(`Missing field ${name}`);
  }
  return control;
}

function findControls(root) {
  return [...root.querySelectorAll("input"), ...root.querySelectorAll("textarea")];
}

function expectValidationPath(action, path) {
  try {
    action();
  } catch (error) {
    expect(error.details?.[0]?.path).toBe(path);
    return;
  }

  throw new Error(`Expected validation error for ${path}`);
}

function adminUser() {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin"
  };
}

function categoryFixture() {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    slug: "crm",
    title: "CRM"
  };
}

function siteFixture() {
  return {
    active: true,
    category: categoryFixture(),
    categoryId: categoryFixture().id,
    deletedAt: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000301",
    previewImageUrl: null,
    shortDescription: "Short",
    slug: "crm-site",
    status: "draft",
    title: "CRM Site"
  };
}

function metaFixture() {
  return {
    limit: 50,
    page: 1,
    total: 0,
    totalPages: 0
  };
}
