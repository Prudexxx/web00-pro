import { describe, expect, it, vi } from "vitest";

import {
  createSitesListScreen,
  getAvailableLifecycleActions
} from "../src/admin/assets/screens/sites-list.js";
import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";

describe("admin site lifecycle UI", () => {
  it("keeps lifecycle actions admin-only and state-aware", () => {
    expect(getAvailableLifecycleActions(siteFixture({ status: "draft" }), "editor")).toEqual([]);
    expect(getAvailableLifecycleActions(siteFixture({ status: "draft" }), "admin").map((item) => item.id)).toEqual([
      "publish",
      "soft-delete"
    ]);
    expect(getAvailableLifecycleActions(siteFixture({ status: "published" }), "admin").map((item) => item.id)).toEqual([
      "unpublish",
      "soft-delete"
    ]);
    expect(getAvailableLifecycleActions(siteFixture({ deletedAt: "2026-07-28T00:00:00.000Z" }), "admin").map((item) => item.id)).toEqual([
      "restore",
      "permanent-delete"
    ]);
    expect(getAvailableLifecycleActions(siteFixture({ active: false, status: "draft" }), "admin")).toEqual([]);
    expect(getAvailableLifecycleActions(siteFixture({ status: "archived" }), "admin")).toEqual([]);
  });

  it("does not render lifecycle buttons for editors", async () => {
    const documentRef = createFakeDocument();
    const screen = createSitesListScreen({
      apiClient: createListApi(siteFixture({ status: "draft" })),
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();

    expect(screen.element.querySelector("[data-lifecycle-action]")).toBeNull();
    expect(screen.element.textContent).not.toMatch(/Опубликовать|Удалить|Восстановить/);
  });

  it("confirms publish once, blocks duplicate clicks, and reloads from the server after success", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [], meta: metaFixture(0) });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({ data: [siteFixture({ status: "draft" })], meta: metaFixture(1) });
        }
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101/publish") {
          return deferred.promise.then(() => ({ data: siteFixture({ status: "published" }) }));
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
    screen.element.querySelector('[data-lifecycle-action="publish"]').dispatchEvent(fakeEvent("click"));
    const confirm = screen.element.querySelector('[data-action="confirm-dialog"]');
    confirm.dispatchEvent(fakeEvent("click"));
    confirm.dispatchEvent(fakeEvent("click"));

    expect(requests.filter((request) => request.requestPath.endsWith("/publish"))).toHaveLength(1);

    deferred.resolve();
    await waitFor(() => requests.filter((request) => request.requestPath === "/api/admin/sites").length === 2);

    expect(requests.find((request) => request.requestPath.endsWith("/publish")).options).toMatchObject({
      method: "POST"
    });
    expect(requests.find((request) => request.requestPath.endsWith("/publish")).options).not.toHaveProperty("body");
  });

  it("requires typed confirmation for permanent delete and sends no invented body", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [], meta: metaFixture(0) });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: [siteFixture({ deletedAt: "2026-07-28T00:00:00.000Z" })],
            meta: metaFixture(1)
          });
        }
        if (requestPath.endsWith("/permanent")) {
          return Promise.resolve({ data: null });
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
    screen.element.querySelector('[data-lifecycle-action="permanent-delete"]').dispatchEvent(fakeEvent("click"));

    const typed = screen.element.querySelector('[name="typedConfirmation"]');
    const confirm = screen.element.querySelector('[data-action="confirm-dialog"]');
    expect(confirm.disabled).toBe(true);
    typed.value = "CRM Site / crm-site";
    typed.dispatchEvent(fakeEvent("input"));
    confirm.dispatchEvent(fakeEvent("click"));
    await waitFor(() => requests.some((request) => request.requestPath.endsWith("/permanent")));

    const mutation = requests.find((request) => request.requestPath.endsWith("/permanent"));
    expect(mutation.options.method).toBe("DELETE");
    expect(mutation.options).not.toHaveProperty("body");
  });

  it("shows safe lifecycle errors without dropping the current list state or retrying", async () => {
    const documentRef = createFakeDocument();
    let mutationCalls = 0;
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [], meta: metaFixture(0) });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({ data: [siteFixture({ status: "draft" })], meta: metaFixture(1) });
        }
        mutationCalls += 1;
        return Promise.reject({
          code: "SITE_PREVIEW_REQUIRED",
          message: 'Preview required <img src=x onerror="x">',
          requestId: "req_lifecycle"
        });
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
    screen.element.querySelector('[data-lifecycle-action="publish"]').dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => screen.element.textContent.includes("SITE_PREVIEW_REQUIRED"));

    expect(mutationCalls).toBe(1);
    expect(screen.element.textContent).toContain('Preview required <img src=x onerror="x">');
    expect(screen.element.textContent).toContain("req_lifecycle");
    expect(screen.element.textContent).toContain("CRM Site");
    expect(screen.element.querySelector("img")).toBeNull();
  });

  it("does not render stale lifecycle success after destroy", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const onStatus = vi.fn();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [], meta: metaFixture(0) });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({ data: [siteFixture({ status: "draft" })], meta: metaFixture(1) });
        }
        return deferred.promise.then(() => ({ data: siteFixture({ status: "published" }) }));
      })
    };
    const screen = createSitesListScreen({
      apiClient,
      documentRef,
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onStatus,
      role: "admin"
    });

    await screen.load();
    screen.element.querySelector('[data-lifecycle-action="publish"]').dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    screen.destroy();
    deferred.resolve();
    await flushPromises();

    expect(onStatus).not.toHaveBeenCalledWith("Сайт опубликован.");
  });

  it("lets existing edit screens open images but keeps create screens upload-free", async () => {
    const documentRef = createFakeDocument();
    const onImages = vi.fn();
    const edit = createSiteEditorScreen({
      apiClient: createEditorApi(),
      documentRef,
      mode: "edit",
      onCancel: vi.fn(),
      onImages,
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });
    const create = createSiteEditorScreen({
      apiClient: createEditorApi(),
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages,
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    await edit.load();
    expect(edit.element.querySelector('[data-action="manage-images"]')).not.toBeNull();
    edit.element.querySelector('[data-action="manage-images"]').dispatchEvent(fakeEvent("click"));
    expect(onImages).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");

    await create.load();
    expect(create.element.querySelector('[data-action="manage-images"]')).toBeNull();
  });
});

function createListApi(site) {
  return {
    requestJson(requestPath) {
      if (requestPath.startsWith("/api/admin/categories")) {
        return Promise.resolve({ data: [], meta: metaFixture(0) });
      }
      return Promise.resolve({ data: [site], meta: metaFixture(1) });
    }
  };
}

function createEditorApi() {
  return {
    requestJson(requestPath) {
      if (requestPath.startsWith("/api/admin/categories")) {
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      }
      return Promise.resolve({ data: siteFixture({ active: true, deletedAt: null, status: "draft" }) });
    }
  };
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
    active: true,
    category: categoryFixture(),
    categoryId: "00000000-0000-4000-8000-000000000001",
    deletedAt: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    previewImageUrl: "https://storage.example.test/preview.webp",
    shortDescription: "Short",
    slug: "crm-site",
    status: "draft",
    title: "CRM Site",
    updatedAt: "2026-07-28T00:00:00.000Z",
    views: 0,
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
  const documentRef = {
    activeElement: null,
    listeners: new Map(),
    createElement(tagName) {
      return new FakeElement(tagName, documentRef);
    },
    createTextNode(text) {
      return new FakeTextNode(text);
    },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      this.listeners.set(type, listeners.filter((item) => item !== listener));
    },
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) ?? []) {
        listener.call(this, event);
      }
    }
  };

  return documentRef;
}

class FakeTextNode {
  constructor(text) {
    this.children = [];
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.attributes = new Map();
    this.checked = false;
    this.children = [];
    this.disabled = false;
    this.files = [];
    this.listeners = new Map();
    this.ownerDocument = ownerDocument;
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
    this.ownerDocument.activeElement = this;
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
      if (match === null) return false;
      const [, name, value] = match;
      return value === "" ? this.attributes.has(name) : this.getAttribute(name) === value;
    }
    return this.tagName === selector.toLowerCase();
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.ownTextContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "checked") this.checked = true;
    if (name === "disabled") this.disabled = true;
    if (name === "name") this.name = String(value);
    if (name === "type") this.type = String(value);
    if (name === "value") this.value = String(value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
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

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for lifecycle work.");
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
