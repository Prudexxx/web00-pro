import { describe, expect, it, vi } from "vitest";

import {
  buildCategoriesListPath,
  buildCategoryCreatePayload,
  buildCategoryUpdatePayload,
  createCategoriesScreen,
  normalizeCategoriesFilters
} from "../src/admin/assets/screens/categories.js";
import {
  click,
  createDeferred,
  createFakeDocument,
  fakeEvent,
  setChecked,
  setValue,
  submit,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin categories screen", () => {
  it("builds current-contract category queries and payloads only", () => {
    expect(buildCategoriesListPath({})).toBe("/api/admin/categories?includeCounts=true&page=1&limit=50");
    expect(buildCategoriesListPath({
      active: false,
      includeCounts: true,
      limit: 100,
      page: 3,
      search: ` ${"x".repeat(120)} `,
      unsupported: "drop"
    })).toBe(
      `/api/admin/categories?search=${"x".repeat(100)}&active=false&includeCounts=true&page=3&limit=100`
    );
    expect(normalizeCategoriesFilters({
      active: "bad",
      includeCounts: false,
      limit: 500,
      page: 0,
      search: "  crm  "
    })).toEqual({
      includeCounts: false,
      limit: 100,
      page: 1,
      search: "crm"
    });
    expect(normalizeCategoriesFilters({ page: 8, search: "next" }, { filtersChanged: true }).page).toBe(1);
    expect(normalizeCategoriesFilters({ active: "true" }).active).toBe(true);
    expect(normalizeCategoriesFilters({ active: "false" }).active).toBe(false);

    expect(buildCategoryCreatePayload({
      active: "on",
      description: "",
      extra: "not sent",
      slug: " CRM-Stack ",
      sortOrder: "4",
      title: " CRM "
    })).toEqual({
      active: true,
      description: null,
      slug: "crm-stack",
      sortOrder: 4,
      title: "CRM"
    });
    expectValidationPath(() => buildCategoryCreatePayload({ slug: "bad slug", title: "CRM" }), "slug");
    expectValidationPath(() => buildCategoryCreatePayload({ slug: "crm", title: "" }), "title");
    expectValidationPath(() => buildCategoryCreatePayload({
      description: "x".repeat(1001),
      slug: "crm",
      title: "CRM"
    }), "description");
    expectValidationPath(() => buildCategoryCreatePayload({ slug: "crm", sortOrder: "-1", title: "CRM" }), "sortOrder");
    expect(buildCategoryUpdatePayload(
      { active: true, description: "Old", slug: "crm", sortOrder: 1, title: "CRM" },
      { active: false, description: "New", slug: "crm-next", sortOrder: "2", title: "CRM Next", unknown: "drop" }
    )).toEqual({
      active: false,
      description: "New",
      slug: "crm-next",
      sortOrder: 2,
      title: "CRM Next"
    });
    expectValidationPath(() => buildCategoryUpdatePayload({ slug: "crm", title: "CRM" }, { slug: "crm", title: "CRM" }), "_form");
  });

  it("lets editors read category DTOs without admin-only fields and renders text safely", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: [categoryFixture({
          active: undefined,
          createdAt: undefined,
          description: '<script>alert("x")</script>',
          title: '<img src=x onerror="boom">'
        })],
        meta: metaFixture(1)
      }))
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();

    expect(apiClient.requestJson).toHaveBeenCalledWith(
      "/api/admin/categories?includeCounts=true&page=1&limit=50",
      expect.objectContaining({ method: "GET" })
    );
    expect(screen.element.textContent).toContain('<img src=x onerror="boom">');
    expect(screen.element.textContent).toContain('<script>alert("x")</script>');
    expect(screen.element.textContent).toContain("00000000-0000-4000-8000-000000000001");
    expect(screen.element.textContent).toContain("14");
    expect(screen.element.querySelector("img")).toBeNull();
    expect(screen.element.querySelector("script")).toBeNull();
    expect(screen.element.textContent).not.toMatch(/Создать категорию|Редактировать|Удалить/);
  });

  it("shows admin fields and category mutation controls", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: [categoryFixture({ active: true })],
        meta: metaFixture(1)
      }))
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expect(screen.element.textContent).toContain("Активна");
    expect(screen.element.textContent).toContain("2026-07-27T10:00:00.000Z");
    expect(screen.element.querySelector('[data-action="create-category"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-action="edit-category"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-action="delete-category"]')).not.toBeNull();
  });

  it("aborts stale list requests and renders loading, empty, filtered-empty, and error states", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const responses = [
      deferred.promise,
      Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) }),
      Promise.resolve({ data: [], meta: metaFixture(0) }),
      Promise.resolve({ data: [], meta: metaFixture(0) }),
      Promise.reject({ message: "List failed.", requestId: "req_categories" })
    ];
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        return responses.shift();
      })
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });

    const firstLoad = screen.load();
    expect(screen.element.textContent).toContain("Загрузка");
    const secondLoad = screen.load();
    deferred.resolve({ data: [categoryFixture({ title: "stale" })], meta: metaFixture(1) });
    await Promise.all([firstLoad, secondLoad]);
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(screen.element.textContent).not.toContain("stale");

    await screen.load();
    expect(screen.element.textContent).toContain("Категорий пока нет");

    screen.setFilters({ search: "crm" });
    await screen.load();
    expect(screen.element.textContent).toContain("Ничего не найдено");

    await screen.load();
    expect(screen.element.textContent).toContain("List failed.");
    expect(screen.element.textContent).toContain("req_categories");
  });

  it("creates categories with exact body and blocks duplicate submits", async () => {
    const documentRef = createFakeDocument();
    const createDeferredRequest = createDeferred();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (options.method === "POST") {
          return createDeferredRequest.promise;
        }
        return Promise.resolve({ data: [], meta: metaFixture(0) });
      })
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    setValue(screen.element, "categorySlug", " CRM-Stack ");
    setValue(screen.element, "categoryTitle", " CRM Stack ");
    setValue(screen.element, "categoryDescription", "");
    setValue(screen.element, "categorySortOrder", "5");
    setChecked(screen.element, "categoryActive", true);
    submit(screen.element, '[data-action="create-category"]');
    submit(screen.element, '[data-action="create-category"]');
    await waitFor(() => requests.filter((request) => request.options.method === "POST").length === 1);

    const post = requests.find((request) => request.options.method === "POST");
    expect(post.requestPath).toBe("/api/admin/categories");
    expect(post.options.body).toEqual({
      active: true,
      description: null,
      slug: "crm-stack",
      sortOrder: 5,
      title: "CRM Stack"
    });
    expect(Object.keys(post.options.body).sort()).toEqual(["active", "description", "slug", "sortOrder", "title"]);

    createDeferredRequest.resolve({ data: categoryFixture({ slug: "crm-stack", title: "CRM Stack" }) });
    await waitFor(() => requests.filter((request) => request.options.method === "GET").length >= 2);
  });

  it("updates categories without unknown fields and keeps the form after server validation errors", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (options.method === "PATCH") {
          return Promise.reject({ code: "CATEGORY_SLUG_CONFLICT", message: '<b>Slug conflict</b>', requestId: "req_slug" });
        }
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      })
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="edit-category"]');
    setValue(screen.element, "categoryTitle", "CRM Next");
    submit(screen.element, '[data-action="save-category"]');
    await waitFor(() => screen.element.textContent.includes("Slug conflict"));

    const patch = requests.find((request) => request.options.method === "PATCH");
    expect(patch.requestPath).toBe("/api/admin/categories/00000000-0000-4000-8000-000000000001");
    expect(patch.options.body).toEqual({ title: "CRM Next" });
    expect(screen.element.textContent).toContain("req_slug");
    expect(screen.element.textContent).toContain("Редактирование категории");
    expect(screen.element.querySelector("b")).toBeNull();
  });

  it("deletes through confirmation, does not optimistically remove rows, and reloads on success", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (options.method === "DELETE" && requests.filter((request) => request.options.method === "DELETE").length === 1) {
          return Promise.reject({ code: "CATEGORY_IN_USE", message: "CATEGORY_IN_USE", requestId: "req_in_use" });
        }
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      })
    };
    const screen = createCategoriesScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="delete-category"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("CATEGORY_IN_USE"));

    expect(requests.filter((request) => request.options.method === "DELETE")).toHaveLength(1);
    expect(screen.element.textContent).toContain("CRM");
    expect(screen.element.textContent).toContain("req_in_use");

    click(screen.element, '[data-action="delete-category"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => requests.filter((request) => request.options.method === "GET").length >= 2);

    const deletion = requests.filter((request) => request.options.method === "DELETE")[1];
    expect(deletion.requestPath).toBe("/api/admin/categories/00000000-0000-4000-8000-000000000001");
    expect(deletion.options.body).toBeUndefined();
  });
});

function categoryFixture(overrides = {}) {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    description: "Business tools",
    id: "00000000-0000-4000-8000-000000000001",
    siteCount: 14,
    slug: "crm",
    sortOrder: 2,
    title: "CRM",
    updatedAt: "2026-07-28T10:00:00.000Z",
    ...overrides
  };
}

function metaFixture(total) {
  return {
    limit: 50,
    page: 1,
    total,
    totalPages: total > 0 ? 1 : 0
  };
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
