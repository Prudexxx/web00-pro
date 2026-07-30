import { describe, expect, it, vi } from "vitest";

import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";

describe("admin site editor screen", () => {
  it("loads categories and creates a draft with an exact safe payload", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath === "/api/admin/categories?limit=100&page=1") {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: {
              id: "00000000-0000-4000-8000-000000000101",
              ...options.body
            }
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const onSaved = vi.fn();
    const onImages = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages,
      onSaved,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    const advanced = screen.element.querySelector('[data-section="advanced-site-settings"]');
    expect(advanced.tagName).toBe("details");
    expect(advanced.getAttribute("open")).toBeNull();
    expect(screen.element.textContent).toContain("Адрес карточки");
    expect(screen.element.textContent).toContain("Создаётся автоматически. Менять обычно не нужно.");
    expect(screen.element.textContent).toContain("Цена, ₽");
    expect(screen.element.textContent).not.toContain("Цена в копейках");

    const demoMode = screen.element.querySelector('[name="demoMode"]');
    expect(demoMode.tagName).toBe("select");
    expect(demoMode.getAttribute("type")).toBeNull();
    expect(demoMode.value).toBe("none");
    expect(demoMode.querySelectorAll("option").map((option) => option.getAttribute("value"))).toEqual([
      "none",
      "external-iframe"
    ]);
    expect(screen.element.querySelector('[name="demoUrlSimple"]')).not.toBeNull();

    setValue(screen.element, "title", " Новый сайт ");
    expect(screen.element.querySelector('[name="slug"]').value).toBe("novyi-sait");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", " Short ");
    setValue(screen.element, "demoMode", "external-iframe");
    setValue(screen.element, "demoUrlSimple", "https://demo.example.test/new");
    setValue(screen.element, "features", "Fast\n\nSafe");
    setValue(screen.element, "tags", "cms\nadmin");
    setValue(screen.element, "priceRubles", "15 000,50");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);
    expect(screen.element.textContent).toContain("Черновик сохранён");
    expect(screen.element.textContent).toContain("Перейти к изображениям");
    expect(screen.element.querySelector("form")).toBeNull();
    screen.element.querySelector('[data-action="manage-images"]').dispatchEvent(fakeEvent("click"));
    expect(onImages).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");

    expect(apiClient.requestJson.mock.calls[0][0]).toBe("/api/admin/categories?limit=100&page=1");
    expect(apiClient.requestJson.mock.calls[1][0]).toBe("/api/ready");
    expect(apiClient.requestJson.mock.calls[2]).toEqual([
      "/api/admin/sites",
      expect.objectContaining({
        body: {
          categoryId: "00000000-0000-4000-8000-000000000001",
          deliveryLabel: null,
          demoMode: "external-iframe",
          demoUrl: "https://demo.example.test/new",
          developmentDays: null,
          externalDemoUrl: "https://demo.example.test/new",
          features: ["Fast", "Safe"],
          fullDescription: null,
          originalDemoUrl: "https://demo.example.test/new",
          priceAmountCents: 1500050,
          priceLabel: null,
          shortDescription: "Short",
          slug: "novyi-sait",
          tags: ["cms", "admin"],
          title: "Новый сайт"
        },
        method: "POST"
      })
    ]);
    expect(apiClient.requestJson.mock.calls[2][1].body).not.toHaveProperty("status");
    expect(apiClient.requestJson.mock.calls[2][1].body).not.toHaveProperty("previewImageUrl");
  });

  it("stops slug auto-generation after manual edits and regenerates on demand", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    setValue(screen.element, "title", "Магазин одежды — тест");
    expect(screen.element.querySelector('[name="slug"]').value).toBe("magazin-odezhdy-test");

    setValue(screen.element, "slug", "manual-slug");
    setValue(screen.element, "title", "Сайт салона красоты");
    expect(screen.element.querySelector('[name="slug"]').value).toBe("manual-slug");

    screen.element.querySelector('[data-action="regenerate-slug"]').dispatchEvent(fakeEvent("click"));
    expect(screen.element.querySelector('[name="slug"]').value).toBe("sait-salona-krasoty");
  });

  it("displays existing null demo mode as the approved none option", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath === "/api/admin/categories?limit=100&page=1") {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (options.method === "GET") {
          return Promise.resolve({ data: siteFixture({ demoMode: null }) });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "edit",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "admin",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();

    const demoMode = screen.element.querySelector('[name="demoMode"]');
    expect(demoMode.tagName).toBe("select");
    expect(demoMode.value).toBe("none");
  });

  it("loads edit data and keeps editor patch payloads away from admin-only fields", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath === "/api/admin/categories?limit=100&page=1") {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "GET") {
          return Promise.resolve({ data: siteFixture() });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "PATCH") {
          return Promise.resolve({ data: { ...siteFixture(), ...options.body } });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "edit",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    expect(screen.element.querySelector('[name="slug"]')).toBeNull();
    expect(screen.element.querySelector('[name="featured"]')).toBeNull();
    expect(screen.element.querySelector('[name="priceRubles"]').value).toBe("");

    setValue(screen.element, "title", "Editor title");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    const patchBody = apiClient.requestJson.mock.calls.find(([, options]) => options.method === "PATCH")[1].body;
    expect(patchBody).toMatchObject({ title: "Editor title" });
    expect(patchBody).not.toHaveProperty("slug");
    expect(patchBody).not.toHaveProperty("featured");
  });

  it("allows admin edit controls for slug and featured", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (options.method === "GET") {
          return Promise.resolve({ data: siteFixture() });
        }
        return Promise.resolve({ data: { ...siteFixture(), ...options.body } });
      })
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "edit",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "admin",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    screen.element.querySelector('[data-section="advanced-site-settings"]').setAttribute("open", "");
    setValue(screen.element, "slug", "admin-slug");
    const featured = screen.element.querySelector('[name="featured"]');
    featured.checked = true;
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    const patchBody = apiClient.requestJson.mock.calls.find(([, options]) => options.method === "PATCH")[1].body;
    expect(patchBody).toMatchObject({
      featured: true,
      slug: "admin-slug"
    });
  });

  it("retains field state on validation and server errors, blocks double submit, and cancels without mutation", async () => {
    const documentRef = createFakeDocument();
    let saveCalls = 0;
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        saveCalls += 1;
        return Promise.reject({
          code: "SLUG_CONFLICT",
          details: [{ message: "Slug already exists.", path: "slug" }],
          message: "Conflict.",
          requestId: "req_conflict"
        });
      })
    };
    const onCancel = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel,
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    setValue(screen.element, "title", "Saved title");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await flushPromises();
    expect(screen.element.textContent).toContain("Short Description is required.");
    expect(screen.element.querySelector('[name="title"]').value).toBe("Saved title");

    setValue(screen.element, "title", "Conflict");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("req_conflict"));

    expect(saveCalls).toBe(1);
    expect(screen.element.textContent).toContain("Адрес карточки уже занят.");
    expect(screen.element.textContent).not.toContain("Slug already exists.");
    expect(screen.element.querySelector('[name="title"]').value).toBe("Conflict");

    screen.element.querySelector('[data-action="cancel-editor"]').dispatchEvent(fakeEvent("click"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("binds demo mode API validation errors to the select without clearing the form", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        return Promise.reject({
          code: "VALIDATION_ERROR",
          details: [{ message: "Выберите допустимый режим демо.", path: "demoMode" }],
          message: "Invalid request.",
          requestId: "req_demo_mode"
        });
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    setValue(screen.element, "title", "Saved title");
    setValue(screen.element, "slug", "demo-mode");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setValue(screen.element, "demoMode", "external-iframe");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("req_demo_mode"));

    const demoMode = screen.element.querySelector('[name="demoMode"]');
    expect(demoMode.tagName).toBe("select");
    expect(demoMode.value).toBe("external-iframe");
    expect(demoMode.focused).toBe(true);
    expect(screen.element.textContent).toContain("Выберите допустимый режим демо.");
    expect(screen.element.querySelector('[name="title"]').value).toBe("Saved title");
  });

  it("binds numeric validation errors to the numeric field without clearing the form", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        return Promise.reject({
          code: "VALIDATION_ERROR",
          details: [{ message: "Цена слишком большая для сохранения.", path: "priceRubles" }],
          message: "Invalid request.",
          requestId: "req_price_overflow"
        });
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    setValue(screen.element, "title", "Saved title");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setValue(screen.element, "priceRubles", "21474836,48");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Цена слишком большая для сохранения."));

    const price = screen.element.querySelector('[name="priceRubles"]');
    expect(price.focused).toBe(true);
    expect(price.value).toBe("21474836,48");
    expect(screen.element.textContent).toContain("Цена слишком большая для сохранения.");
    expect(screen.element.querySelector('[name="title"]').value).toBe("Saved title");
    expect(apiClient.requestJson).toHaveBeenCalledTimes(1);
  });

  it("autosaves form drafts, restores them on demand, and clears only after successful save", async () => {
    const documentRef = createFakeDocument();
    const storage = createMemoryStorage();
    const windowRef = createFakeWindow();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({ data: { id: "00000000-0000-4000-8000-000000000202", ...options.body } });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      draftAutosaveMs: 1,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      storage,
      windowRef
    });

    await screen.load();
    setValue(screen.element, "title", "Черновик формы");
    await waitFor(() => storage.setItem.mock.calls.length > 0);
    const blockedUnload = fakeEvent("beforeunload");
    windowRef.dispatchEvent(blockedUnload);
    expect(blockedUnload.defaultPrevented).toBe(true);
    expect(blockedUnload.returnValue).toBe("");

    const [draftKey, draftText] = storage.setItem.mock.calls.at(-1);
    expect(draftKey).toContain("web00_admin_site_form_draft_v1");
    expect(draftText).toContain("Черновик формы");
    expect(draftText).not.toMatch(/accessToken|Authorization|cookie|password|token/i);

    const restored = createSiteEditorScreen({
      apiClient: {
        requestJson: vi.fn((requestPath) => {
          if (requestPath.startsWith("/api/admin/categories")) {
            return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
          }
          throw new Error(`Unexpected path ${requestPath}`);
        })
      },
      documentRef: createFakeDocument(),
      draftAutosaveMs: 1,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      storage
    });

    await restored.load();
    expect(restored.element.textContent).toContain("Найдены несохранённые данные. Восстановить?");
    restored.element.querySelector('[data-action="restore-site-draft"]').dispatchEvent(fakeEvent("click"));
    expect(restored.element.querySelector('[name="title"]').value).toBe("Черновик формы");

    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => storage.removeItem.mock.calls.length > 0);
    const allowedUnload = fakeEvent("beforeunload");
    windowRef.dispatchEvent(allowedUnload);
    expect(allowedUnload.defaultPrevented).toBe(false);
  });

  it("verifies a network-failed create by exact slug before allowing retry", async () => {
    const documentRef = createFakeDocument();
    const onSaved = vi.fn();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.reject({ code: "NETWORK_ERROR", message: "Unable to reach the server.", status: 0 });
        }
        if (requestPath === "/api/admin/sites?search=magazin-odezhdy-test&deleted=without") {
          return Promise.resolve({
            data: [siteFixture({
              id: "00000000-0000-4000-8000-000000000303",
              slug: "magazin-odezhdy-test",
              title: "Магазин одежды — тест"
            })],
            meta: metaFixture(1)
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    setValue(screen.element, "title", "Магазин одежды — тест");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
    expect(requests.some((request) => request.requestPath.includes("search=magazin-odezhdy-test"))).toBe(true);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      slug: "magazin-odezhdy-test"
    }));
    expect(screen.element.textContent).toContain("Перейти к изображениям");
    expect(screen.element.querySelector("form")).toBeNull();
  });

  it("keeps local form data and does not submit while the browser reports offline", async () => {
    const documentRef = createFakeDocument();
    const windowRef = createFakeWindow();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      windowRef
    });

    await screen.load();
    windowRef.dispatchEvent(fakeEvent("offline"));
    setValue(screen.element, "title", "Offline title");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await flushPromises();

    expect(screen.element.textContent).toContain("Соединение нестабильно. Форма сохранена локально.");
    expect(screen.element.querySelector('[name="title"]').value).toBe("Offline title");
    expect(apiClient.requestJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/admin/categories?limit=100&page=1"
    ]);
  });
});

function setValue(root, name, value) {
  const input = root.querySelector(`[name="${name}"]`);
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(fakeEvent("input"));
  input.dispatchEvent(fakeEvent("change"));
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
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: null,
    featured: false,
    features: ["Fast"],
    fullDescription: null,
    id: "00000000-0000-4000-8000-000000000101",
    legacyTitle: null,
    originalDemoUrl: null,
    previewType: null,
    priceAmountCents: null,
    priceLabel: null,
    shortDescription: "Short",
    siteUrl: null,
    slug: "crm-site",
    sortOrder: 0,
    status: "draft",
    tags: ["cms"],
    title: "CRM Site",
    ...overrides
  };
}

function metaFixture(total) {
  return {
    limit: 100,
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
    this.checked = false;
    this.children = [];
    this.disabled = false;
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
    if (event.target === null || event.target === undefined) {
      event.target = this;
    }
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener.call(this, event);
    }
    if (!event.defaultPrevented && event.bubbles !== false && this.parentNode?.dispatchEvent !== undefined) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  focus() {
    this.focused = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
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
    if (name === "checked") this.checked = true;
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

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  throw new Error("Timed out waiting for admin editor work.");
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    removeItem: vi.fn((key) => {
      values.delete(key);
    }),
    setItem: vi.fn((key, value) => {
      values.set(key, String(value));
    })
  };
}

function createFakeWindow() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      const items = listeners.get(type) ?? [];
      items.push(listener);
      listeners.set(type, items);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener.call(this, event);
      }
    },
    removeEventListener(type, listener) {
      const items = listeners.get(type) ?? [];
      listeners.set(type, items.filter((item) => item !== listener));
    },
    navigator: {
      onLine: true
    }
  };
}
