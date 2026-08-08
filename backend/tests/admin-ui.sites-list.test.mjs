import { describe, expect, it, vi } from "vitest";

import {
  buildSitesListPath,
  createSitesListScreen,
  normalizeSitesListFilters
} from "../src/admin/assets/screens/sites-list.js";

const CLEANUP_SITE_SLUG = "codex-acceptance-site-20260728-1836";

describe("admin sites list screen", () => {
  it("builds only approved query keys and resets page when filters change", () => {
    expect(buildSitesListPath({})).toBe("/api/admin/sites");
    expect(buildSitesListPath({
      category: "00000000-0000-4000-8000-000000000001",
      deleted: "only",
      direction: "asc",
      limit: 100,
      page: 3,
      search: "WEB00",
      sort: "title",
      status: "draft",
      unsupported: "drop"
    })).toBe(
      "/api/admin/sites?search=WEB00&status=draft&category=00000000-0000-4000-8000-000000000001&deleted=only&sort=title&direction=asc&page=3&limit=100"
    );
    expect(normalizeSitesListFilters({
      deleted: "bad",
      direction: "bad",
      limit: 500,
      page: 0,
      search: "  term  ",
      sort: "bad",
      status: "bad"
    })).toEqual({
      deleted: "without",
      direction: "desc",
      limit: 100,
      page: 1,
      search: "term",
      sort: "updatedAt"
    });
    expect(normalizeSitesListFilters({ page: 4, search: "x" }, { filtersChanged: true }).page).toBe(1);
  });

  it("loads categories and sites, aborting stale list requests", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/admin/categories?limit=100&page=1") {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        return Promise.resolve({
          data: [siteFixture({ title: '<img src=x onerror="boom">' })],
          meta: metaFixture(1)
        });
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });
    const firstLoad = screen.load();
    const secondLoad = screen.load();

    await Promise.all([firstLoad, secondLoad]);

    expect(requests[0].requestPath).toBe("/api/admin/categories?limit=100&page=1");
    expect(requests.some((request) => request.requestPath === "/api/admin/sites")).toBe(true);
    expect(requests.find((request) => request.requestPath === "/api/admin/sites").options.signal.aborted).toBe(true);
    expect(screen.element.textContent).toContain('<img src=x onerror="boom">');
    expect(screen.element.querySelector("img")).toBeNull();
    expect(screen.element.textContent).not.toMatch(/Опубликовать|Удалить/);
  });

  it("renders admin-only DTO fields only for admins and exposes create/edit actions", async () => {
    const documentRef = createFakeDocument();
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        return Promise.resolve({
          data: [siteFixture({ active: true, deletedAt: null, views: 12 })],
          meta: metaFixture(1)
        });
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate,
      onEdit,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    screen.element.querySelector('[data-action="create-site"]').dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="edit-site"]').dispatchEvent(fakeEvent("click"));

    expect(screen.element.textContent).toContain("Активен");
    expect(screen.element.textContent).toContain("12");
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");
  });

  it("renders draft and published lifecycle actions inline without overflow menus", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        return Promise.resolve({
          data: [
            siteFixture({
              active: true,
              deletedAt: null,
              id: "00000000-0000-4000-8000-000000000101",
              slug: "draft-site",
              status: "draft",
              title: "Draft Site"
            }),
            siteFixture({
              active: true,
              deletedAt: null,
              id: "00000000-0000-4000-8000-000000000102",
              slug: "published-site",
              status: "published",
              title: "Published Site"
            })
          ],
          meta: metaFixture(2)
        });
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onImages: vi.fn(),
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expect(screen.element.textContent).not.toContain("⋯");
    expect(elementsWithAttribute(screen.element, "data-action", "site-row-overflow")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-overflow-menu", "true")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-action", "edit-site")).toHaveLength(2);
    expect(elementsWithAttribute(screen.element, "data-action", "manage-images")).toHaveLength(2);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "publish")).toHaveLength(1);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "unpublish")).toHaveLength(1);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "soft-delete")).toHaveLength(2);

    elementsWithAttribute(screen.element, "data-lifecycle-action", "publish")[0].dispatchEvent(fakeEvent("click"));

    expect(screen.element.textContent).toContain("Сайт станет доступен публичному каталогу после подтверждения сервером.");
    expect(screen.element.textContent).toContain("Сайт: Draft Site / draft-site.");
  });

  it("uses admin site lifecycle routes and Atomic catalog status for publish, unpublish, and soft delete", async () => {
    for (const scenario of [
      {
        action: "publish",
        initial: siteFixture({ slug: "draft-site", status: "draft", title: "Draft Site" }),
        method: "POST",
        path: "/api/admin/sites/00000000-0000-4000-8000-000000000101/publish",
        result: siteFixture({ slug: "draft-site", status: "published", title: "Draft Site" }),
        success: "Сайт опубликован."
      },
      {
        action: "unpublish",
        initial: siteFixture({ slug: "published-site", status: "published", title: "Published Site" }),
        method: "POST",
        path: "/api/admin/sites/00000000-0000-4000-8000-000000000101/unpublish",
        result: siteFixture({ slug: "published-site", status: "draft", title: "Published Site" }),
        success: "Сайт снят с публикации."
      },
      {
        action: "soft-delete",
        initial: siteFixture({ slug: "delete-site", status: "published", title: "Delete Site" }),
        method: "DELETE",
        path: "/api/admin/sites/00000000-0000-4000-8000-000000000101",
        result: siteFixture({
          deletedAt: "2026-07-30T12:00:00.000Z",
          slug: "delete-site",
          status: "published",
          title: "Delete Site"
        }),
        success: "Сайт удалён."
      }
    ]) {
      const { requests, screen } = await createLoadedSitesListLifecycleScreen({
        initialSite: scenario.initial,
        lifecycleHandler: (requestPath, options) => {
          expect(requestPath).toBe(scenario.path);
          expect(options.method).toBe(scenario.method);
          return Promise.resolve({ data: scenario.result });
        }
      });

      elementsWithAttribute(screen.element, "data-lifecycle-action", scenario.action)[0]
        .dispatchEvent(fakeEvent("click"));
      screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));

      await waitFor(() => {
        expect(screen.element.textContent).toContain(scenario.success);
      });

      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: scenario.method, requestPath: scenario.path }),
        expect.objectContaining({ method: "GET", requestPath: "/api/admin/public-catalog/status" })
      ]));
      expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(2);
      expect(requests.some((request) => request.requestPath.includes("/api/admin/publication/pages"))).toBe(false);
    }
  });

  it("keeps the lifecycle mutation successful when Atomic catalog status reports failure or timeout", async () => {
    const failed = await createLoadedSitesListLifecycleScreen({
      initialSite: siteFixture({ status: "published" }),
      statusResponses: [{ data: { syncStatus: "failed" } }]
    });

    elementsWithAttribute(failed.screen.element, "data-lifecycle-action", "unpublish")[0]
      .dispatchEvent(fakeEvent("click"));
    failed.screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));

    await waitFor(() => {
      expect(failed.screen.element.textContent).toContain("Изменение сохранено, но каталог не опубликован.");
    });

    const timedOut = await createLoadedSitesListLifecycleScreen({
      initialSite: siteFixture({ status: "published" }),
      statusResponses: [
        { data: { syncStatus: "pending" } },
        { data: { syncStatus: "pending" } },
        { data: { syncStatus: "pending" } },
        { data: { syncStatus: "pending" } },
        { data: { syncStatus: "pending" } }
      ]
    });

    elementsWithAttribute(timedOut.screen.element, "data-lifecycle-action", "unpublish")[0]
      .dispatchEvent(fakeEvent("click"));
    timedOut.screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));

    await waitFor(() => {
      expect(timedOut.screen.element.textContent).toContain("Изменение сохранено. Каталог продолжает обновляться.");
    });

    expect(failed.requests.some((request) => request.requestPath.includes("/api/admin/publication/pages"))).toBe(false);
    expect(timedOut.requests.some((request) => request.requestPath.includes("/api/admin/publication/pages"))).toBe(false);
  });

  it("verifies the site state after an uncertain lifecycle response without duplicating the mutation", async () => {
    const { requests, screen } = await createLoadedSitesListLifecycleScreen({
      initialSite: siteFixture({ status: "draft" }),
      lifecycleHandler: () => Promise.reject({ code: "NETWORK_ERROR", status: 0 }),
      readSite: siteFixture({ status: "published" })
    });

    elementsWithAttribute(screen.element, "data-lifecycle-action", "publish")[0]
      .dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));

    await waitFor(() => {
      expect(screen.element.textContent).toContain("Сайт опубликован.");
    });

    expect(requests.filter((request) => (
      request.requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101/publish" &&
      request.method === "POST"
    ))).toHaveLength(1);
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: "GET",
        requestPath: "/api/admin/sites/00000000-0000-4000-8000-000000000101"
      }),
      expect.objectContaining({
        method: "GET",
        requestPath: "/api/admin/public-catalog/status"
      })
    ]));
    expect(requests.some((request) => request.requestPath.includes("/api/admin/publication/pages"))).toBe(false);
  });

  it("renders loading, empty, filtered-empty, and error states", async () => {
    const documentRef = createFakeDocument();
    const siteResponses = [
      { data: [], meta: metaFixture(0) },
      { data: [], meta: metaFixture(0) }
    ];
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [], meta: metaFixture(0) });
        }
        const next = siteResponses.shift();
        if (next !== undefined) {
          return Promise.resolve(next);
        }
        return Promise.reject({ code: "NETWORK_ERROR", message: "Network", requestId: "req_list" });
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    const loading = screen.load();
    expect(screen.element.textContent).toContain("Загрузка");
    await loading;
    expect(screen.element.textContent).toContain("Сайтов пока нет");

    screen.setFilters({ search: "crm" });
    await screen.load();
    expect(screen.element.textContent).toContain("Ничего не найдено");

    await screen.load();
    expect(screen.element.textContent).toContain("Network");
    expect(screen.element.textContent).toContain("req_list");
  });

  it("submits browser NodeList-backed filters and replaces stale rows with deleted results", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        requests.push(requestPath);
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath.includes(`search=${CLEANUP_SITE_SLUG}`) && requestPath.includes("deleted=only")) {
          return Promise.resolve({
            data: [
              siteFixture({
                active: false,
                deletedAt: "2026-07-28T18:36:00.000Z",
                slug: CLEANUP_SITE_SLUG,
                title: "Temporary deleted cleanup site"
              })
            ],
            meta: metaFixture(1)
          });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: [siteFixture({ slug: "drova", title: "Original active draft row" })],
            meta: metaFixture(1)
          });
        }

        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    expect(screen.element.textContent).toContain("Original active draft row");

    const namedFields = screen.element.querySelector("form").querySelectorAll("[name]");
    expect(namedFields).toHaveLength(10);
    expect(namedFields.item(0)).toBe(namedFields[0]);
    expect([...namedFields]).toHaveLength(10);
    expect(namedFields.map).toBeUndefined();

    screen.element.querySelector('[name="search"]').value = CLEANUP_SITE_SLUG;
    screen.element.querySelector('[name="deleted"]').value = "only";
    screen.element.querySelector('[name="page"]').value = "7";

    expect(() => {
      screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    }).not.toThrow();

    await waitFor(() => {
      expect(requests.some((requestPath) => requestPath.includes(`search=${CLEANUP_SITE_SLUG}`))).toBe(true);
      expect(screen.element.textContent).toContain("Temporary deleted cleanup site");
    });
    const filteredRequest = requests.find((requestPath) => requestPath.includes(`search=${CLEANUP_SITE_SLUG}`));

    expect(filteredRequest).toContain(`search=${CLEANUP_SITE_SLUG}`);
    expect(filteredRequest).toContain("deleted=only");
    expect(filteredRequest).toContain("page=1");
    expect(screen.element.textContent).toContain(CLEANUP_SITE_SLUG);
    expect(screen.element.textContent).not.toContain("Original active draft row");
    expect(screen.element.textContent).not.toContain("drova");
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "restore")).toHaveLength(1);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "permanent-delete")).toHaveLength(1);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "soft-delete")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "publish")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-lifecycle-action", "unpublish")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-action", "edit-site")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-action", "manage-images")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-action", "site-row-overflow")).toHaveLength(0);
    expect(elementsWithAttribute(screen.element, "data-overflow-menu", "true")).toHaveLength(0);
    expect(screen.element.textContent).not.toContain("⋯");

    elementsWithAttribute(screen.element, "data-lifecycle-action", "restore")[0].dispatchEvent(fakeEvent("click"));

    expect(screen.element.textContent).toContain("Сайт вернётся из удалённых после подтверждения сервером.");
    expect(screen.element.textContent).toContain(`Сайт: Temporary deleted cleanup site / ${CLEANUP_SITE_SLUG}.`);
  });
});

async function createLoadedSitesListLifecycleScreen(options = {}) {
  const documentRef = createFakeDocument();
  const requests = [];
  let currentSite = options.initialSite ?? siteFixture();
  const statusResponses = [...(options.statusResponses ?? [{ data: { syncStatus: "ready" } }])];
  const lifecycleHandler = options.lifecycleHandler ?? ((_requestPath, _requestOptions) => {
    currentSite = options.resultSite ?? siteFixture({ status: "published" });
    return Promise.resolve({ data: currentSite });
  });
  const apiClient = {
    requestJson: vi.fn((requestPath, requestOptions = {}) => {
      requests.push({ method: requestOptions.method, requestPath });
      if (requestPath.startsWith("/api/admin/categories")) {
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      }
      if (requestPath === "/api/admin/sites") {
        return Promise.resolve({ data: [currentSite], meta: metaFixture(1) });
      }
      if (
        requestOptions.method === "DELETE" &&
        requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101"
      ) {
        return lifecycleHandler(requestPath, requestOptions);
      }
      if (
        requestOptions.method === "GET" &&
        requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101"
      ) {
        return Promise.resolve({ data: options.readSite ?? currentSite });
      }
      if (requestPath === "/api/admin/public-catalog/status") {
        return Promise.resolve(statusResponses.shift() ?? statusResponses.at(-1) ?? { data: { syncStatus: "ready" } });
      }
      if (
        requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101/publish" ||
        requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101/unpublish"
      ) {
        return lifecycleHandler(requestPath, requestOptions);
      }

      throw new Error(`Unexpected path ${requestPath}`);
    })
  };
  const screen = createSitesListScreen({
    apiClient,
    documentRef,
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onImages: vi.fn(),
    onStatus: vi.fn(),
    pollIntervalMs: 0,
    role: "admin"
  });

  await screen.load();

  return { requests, screen };
}

function categoryFixture() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "crm",
    title: "CRM"
  };
}

function siteFixture(overrides = {}) {
  return {
    category: categoryFixture(),
    categoryId: "00000000-0000-4000-8000-000000000001",
    id: "00000000-0000-4000-8000-000000000101",
    shortDescription: "Short",
    slug: "crm-site",
    status: "draft",
    title: "CRM Site",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides
  };
}

function metaFixture(total) {
  return {
    limit: 20,
    page: 1,
    total,
    totalPages: total > 0 ? 1 : 0
  };
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createTextNode(text) {
      return new FakeTextNode(text);
    }
  };
}

class FakeTextNode {
  constructor(text) {
    this.children = [];
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName) {
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.tagName = tagName.toLowerCase();
    this.value = "";
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === "string" ? new FakeTextNode(node) : node;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  focus() {
    this.focused = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    walk(this, (node) => {
      if (node instanceof FakeElement && node.matches(selector)) {
        matches.push(node);
      }
    });
    return new FakeNodeList(matches);
  }

  matches(selector) {
    if (selector.startsWith("[")) {
      const match = /^\[([^=\]]+)=?"?([^\]"]*)"?\]$/.exec(selector);
      if (match === null) {
        return false;
      }
      const [, name, value] = match;
      return value === "" ? this.attributes.has(name) : this.getAttribute(name) === value;
    }
    return this.tagName === selector.toLowerCase();
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "name") this.name = String(value);
    if (name === "type") this.type = String(value);
    if (name === "value") this.value = String(value);
  }

  get textContent() {
    return [
      this.ownTextContent ?? "",
      ...this.children.map((child) => child.textContent)
    ].join("");
  }

  set textContent(value) {
    this.ownTextContent = String(value);
    this.children = [];
  }
}

class FakeNodeList {
  constructor(nodes) {
    this.length = nodes.length;
    nodes.forEach((node, index) => {
      this[index] = node;
    });
  }

  item(index) {
    return this[index] ?? null;
  }

  values() {
    return Array.prototype.values.call(this);
  }

  [Symbol.iterator]() {
    return this.values();
  }
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

function elementsWithAttribute(root, name, value) {
  const matches = [];

  walk(root, (node) => {
    if (node instanceof FakeElement && node.getAttribute(name) === value) {
      matches.push(node);
    }
  });

  return matches;
}

async function waitFor(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError ?? new Error("Timed out waiting for assertion.");
}

function fakeEvent(type) {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: null,
    type
  };
}
