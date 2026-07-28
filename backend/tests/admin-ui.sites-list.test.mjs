import { describe, expect, it, vi } from "vitest";

import {
  buildSitesListPath,
  createSitesListScreen,
  normalizeSitesListFilters
} from "../src/admin/assets/screens/sites-list.js";

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
});

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
    return matches;
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

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
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
