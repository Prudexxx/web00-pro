import { describe, expect, it, vi } from "vitest";

import { ADMIN_REQUEST_TIMEOUTS } from "../src/admin/assets/api-client.js";
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
      createRetryBackoffMs: 0,
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
      createRetryBackoffMs: 0,
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

  it("classifies only SLUG_CONFLICT as an address conflict", async () => {
    for (const scenario of [
      {
        code: "IDEMPOTENCY_KEY_REUSED",
        expected: "Эта операция уже использована с другими данными.",
        message: "Операция сохранения уже использована с другими данными."
      },
      {
        code: "IDEMPOTENCY_REPLAY_UNAVAILABLE",
        expected: "Не удалось восстановить результат предыдущего сохранения.",
        message: "Не удалось восстановить результат предыдущего сохранения."
      },
      {
        code: "SITE_PREVIEW_REQUIRED",
        expected: "Preview required before publish.",
        message: "Preview required before publish."
      }
    ]) {
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
            code: scenario.code,
            details: [],
            message: scenario.message,
            requestId: `req_${scenario.code.toLowerCase()}`,
            status: 409
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
      setValue(screen.element, "title", "Conflict shape");
      setValue(screen.element, "slug", "conflict-shape");
      setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
      setValue(screen.element, "shortDescription", "Short");
      screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
      await waitFor(() => screen.element.textContent.includes(`req_${scenario.code.toLowerCase()}`));

      expect(screen.element.textContent).toContain(scenario.expected);
      expect(screen.element.textContent).not.toContain("Адрес карточки уже занят");
      expect(screen.element.querySelector('[name="slug"]').focused).not.toBe(true);
    }
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
      createRetryBackoffMs: 0,
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

    const createRequests = requests.filter((request) => request.requestPath === "/api/admin/sites");

    expect(createRequests).toHaveLength(2);
    expect(createRequests[1].options.headers["X-Request-Id"]).toBe(createRequests[0].options.headers["X-Request-Id"]);
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

  it("persists drafts immediately on page lifecycle events with a stable create request id and no secrets/files", async () => {
    const documentRef = createFakeDocument();
    const windowRef = createFakeWindow();
    const storage = createMemoryStorage();
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
      draftAutosaveMs: 1000,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      storage,
      windowRef
    });

    await screen.load();
    setValue(screen.element, "title", "Lifecycle title");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("preview.png", "image/png", 12)]);

    documentRef.visibilityState = "hidden";
    documentRef.dispatchEvent(fakeEvent("visibilitychange"));
    windowRef.dispatchEvent(fakeEvent("pagehide"));
    windowRef.dispatchEvent(fakeEvent("offline"));

    expect(storage.setItem.mock.calls.length).toBeGreaterThanOrEqual(3);
    const draft = JSON.parse(storage.setItem.mock.calls.at(-1)[1]);

    expect(draft).toMatchObject({
      fields: expect.objectContaining({
        categoryId: "00000000-0000-4000-8000-000000000001",
        shortDescription: "Short",
        title: "Lifecycle title"
      }),
      routeType: "create",
      siteId: null,
      updatedAt: expect.any(String)
    });
    expect(draft.clientRequestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(JSON.stringify(draft)).not.toMatch(/token|authorization|cookie|password|jwt|secret/i);
    expect(JSON.stringify(draft)).not.toContain("preview.png");
    expect(JSON.stringify(draft)).not.toContain("C:\\");

    screen.destroy();

    expect(documentRef.listenerCount("visibilitychange")).toBe(0);
    expect(windowRef.listenerCount("pagehide")).toBe(0);
    expect(windowRef.listenerCount("offline")).toBe(0);
  });

  it("persists the latest dirty draft synchronously when the screen is destroyed", async () => {
    const documentRef = createFakeDocument();
    const storage = createMemoryStorage();
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
      draftAutosaveMs: 1000,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      storage
    });

    await screen.load();
    setValue(screen.element, "title", "Latest value before navigation");
    screen.destroy();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const draft = JSON.parse(storage.setItem.mock.calls[0][1]);
    expect(draft.fields.title).toBe("Latest value before navigation");
  });

  it("does not recreate a local draft when a saved screen is destroyed", async () => {
    const documentRef = createFakeDocument();
    const storage = createMemoryStorage();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000909",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      draftAutosaveMs: 1000,
      mode: "create",
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      storage
    });

    await screen.load();
    setValue(screen.element, "title", "Saved no recreate");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => storage.removeItem.mock.calls.length === 1);

    storage.setItem.mockClear();
    screen.destroy();

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reuses one stable X-Request-Id for a safe timeout retry before exact slug verification", async () => {
    const documentRef = createFakeDocument();
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
          const createAttempts = requests.filter((request) => request.requestPath === "/api/admin/sites").length;
          if (createAttempts === 1) {
            return Promise.reject({
              code: "REQUEST_TIMEOUT",
              message: "Сервер не ответил вовремя.",
              status: 0
            });
          }

          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000303",
              slug: options.body.slug,
              title: options.body.title
            }),
            meta: { replayed: true }
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      createRetryBackoffMs: 0,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();
    setValue(screen.element, "title", "Retry title");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    const createRequests = requests.filter((request) => request.requestPath === "/api/admin/sites");

    expect(createRequests).toHaveLength(2);
    expect(createRequests[0].options.headers["X-Request-Id"]).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(createRequests[1].options.headers["X-Request-Id"]).toBe(createRequests[0].options.headers["X-Request-Id"]);
    expect(requests.some((request) => request.requestPath.includes("search="))).toBe(false);
    expect(screen.element.textContent).toContain("Карточка сохранена");
  });

  it("blocks invalid selected images before creating a site", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
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
    expect(screen.element.textContent).toContain("Изображения — необязательно");
    expect(userFacingCopy(screen.element)).toContain("Описание главного изображения");
    expect(userFacingCopy(screen.element)).toContain("Общее описание изображений галереи");
    expect(userFacingCopy(screen.element)).not.toMatch(/\bAlt\b|preview|gallery|batch/i);
    setValue(screen.element, "title", "Image validation");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("bad.gif", "image/gif", 12)]);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await flushPromises();

    expect(screen.element.textContent).toContain("Поддерживаются только JPEG, PNG, WEBP или AVIF.");
    expect(apiClient.requestJson.mock.calls.some(([path]) => path === "/api/admin/sites")).toBe(false);
    expect(apiClient.requestMultipart).not.toHaveBeenCalled();
  });

  it("creates once, uploads selected preview/five gallery files, and shows a completed one-click success", async () => {
    const documentRef = createFakeDocument();
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
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000777",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.endsWith("/images/preview")) {
          return Promise.resolve({
            data: {
              previewImage: {
                assetId: "preview-asset",
                url: "https://storage.example.test/preview.webp"
              }
            }
          });
        }
        if (requestPath.endsWith("/images/gallery/batch")) {
          const metadata = JSON.parse(options.body.get("metadata"));

          return Promise.resolve({
            data: {
              failed: [],
              succeeded: metadata.map((item, index) => ({
                clientFileId: item.clientFileId,
                image: { assetId: `gallery-asset-${index}` },
                index,
                replayed: false
              }))
            }
          });
        }
        throw new Error(`Unexpected multipart path ${requestPath}`);
      })
    };
    const onImages = vi.fn();
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages,
      onSaved,
      onStatus: vi.fn(),
      role: "editor",
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-000000000301",
        "00000000-0000-4000-8000-000000000402",
        "00000000-0000-4000-8000-000000000403",
        "00000000-0000-4000-8000-000000000404",
        "00000000-0000-4000-8000-000000000405",
        "00000000-0000-4000-8000-000000000406"
      ])
    });

    await screen.load();
    setValue(screen.element, "title", "One click images");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("preview.jpg", "image/jpeg", 12)]);
    setValue(screen.element, "previewAlt", "Preview alt");
    setFiles(screen.element, "galleryBatchImages", [
      imageFile("gallery-1.webp", "image/webp", 12),
      imageFile("gallery-2.webp", "image/webp", 12),
      imageFile("gallery-3.webp", "image/webp", 12),
      imageFile("gallery-4.webp", "image/webp", 12),
      imageFile("gallery-5.webp", "image/webp", 12)
    ]);
    setValue(screen.element, "galleryBatchAlt", "Gallery alt");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Карточка и изображения сохранены."));

    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
    expect(requests.map((request) => request.requestPath)).toContain(
      "/api/admin/sites/00000000-0000-4000-8000-000000000777/images/preview"
    );
    expect(requests.map((request) => request.requestPath)).toContain(
      "/api/admin/sites/00000000-0000-4000-8000-000000000777/images/gallery/batch"
    );
    expect(requests.find((request) => request.requestPath.endsWith("/images/preview")).options.body.get("clientFileId")).toBe(
      "00000000-0000-4000-8000-000000000301"
    );
    expect(JSON.parse(
      requests.find((request) => request.requestPath.endsWith("/images/gallery/batch")).options.body.get("metadata")
    ).map((item) => item.clientFileId)).toEqual([
      "00000000-0000-4000-8000-000000000402",
      "00000000-0000-4000-8000-000000000403",
      "00000000-0000-4000-8000-000000000404",
      "00000000-0000-4000-8000-000000000405",
      "00000000-0000-4000-8000-000000000406"
    ]);
    expect(onSaved).toHaveBeenCalledTimes(1);

    screen.element.querySelector('[data-action="manage-images"]').dispatchEvent(fakeEvent("click"));
    expect(onImages).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000777");
  });

  it("recovers partial image failures without a second create POST and retries only failed files", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    let previewAttempts = 0;
    let galleryAttempts = 0;
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
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000888",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.endsWith("/images/preview")) {
          previewAttempts += 1;
          if (previewAttempts === 1) {
            return Promise.reject({
              code: "REQUEST_TIMEOUT",
              message: "Сервер не ответил вовремя.",
              requestId: "req_preview_timeout",
              status: 0
            });
          }
          return Promise.resolve({ data: { previewImage: { assetId: "preview-ok" } } });
        }
        if (requestPath.endsWith("/images/gallery/batch")) {
          galleryAttempts += 1;
          const metadata = JSON.parse(options.body.get("metadata"));

          if (galleryAttempts > 1) {
            return Promise.resolve({
              data: {
                failed: [],
                succeeded: metadata.map((item, index) => ({
                  clientFileId: item.clientFileId,
                  image: { assetId: `gallery-retry-ok-${index}` },
                  index,
                  replayed: false
                }))
              }
            });
          }

          return Promise.resolve({
            data: {
              failed: [{
                clientFileId: "00000000-0000-4000-8000-000000000402",
                code: "IMAGE_TOO_LARGE",
                index: 1,
                message: "Too large."
              }],
              succeeded: [{
                clientFileId: "00000000-0000-4000-8000-000000000401",
                image: { assetId: "gallery-ok" },
                index: 0,
                replayed: false
              }]
            }
          });
        }
        throw new Error(`Unexpected multipart path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-000000000301",
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402",
        "00000000-0000-4000-8000-000000000501"
      ])
    });

    await screen.load();
    setValue(screen.element, "title", "Partial images");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("preview.png", "image/png", 12)]);
    setFiles(screen.element, "galleryBatchImages", [
      imageFile("ok.webp", "image/webp", 12),
      imageFile("retry.webp", "image/webp", 12)
    ]);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Карточка сохранена. Часть изображений не загрузилась."));

    expect(screen.element.textContent).toContain("1 успешно");
    expect(screen.element.textContent).toContain("2 ошибки");
    expect(screen.element.textContent).toContain("req_preview_timeout");
    expect(screen.element.textContent).toContain("Успешно загружено");
    expect(screen.element.textContent).toContain("Изображение галереи: ok.webp");
    expect(screen.element.textContent).toContain("Не загрузилось");
    expect(screen.element.textContent).toContain("Главное изображение: preview.png");
    expect(screen.element.textContent).toContain("Сервер не ответил вовремя.");
    expect(screen.element.textContent).toContain("Изображение галереи: retry.webp");
    expect(screen.element.textContent).toContain("Too large.");
    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);

    screen.element.querySelector('[data-action="retry-image-upload"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => previewAttempts === 2);
    await waitFor(() => requests.filter((request) => request.requestPath.endsWith("/images/gallery/batch")).length === 2);

    const previewRequests = requests.filter((request) => request.requestPath.endsWith("/images/preview"));
    expect(previewRequests).toHaveLength(2);
    expect(previewRequests[0].options.body.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000301");
    expect(previewRequests[1].options.body.get("clientFileId")).toBe(previewRequests[0].options.body.get("clientFileId"));

    const galleryRequests = requests.filter((request) => request.requestPath.endsWith("/images/gallery/batch"));
    expect(JSON.parse(galleryRequests[1].options.body.get("metadata"))).toEqual([
      {
        alt: "",
        clientFileId: "00000000-0000-4000-8000-000000000402"
      }
    ]);
    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
    await waitFor(() => screen.element.textContent.includes("Карточка и изображения сохранены."));
  });

  it("carries requestId from a successful partial gallery batch envelope and retries only the two failed files", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    let galleryAttempts = 0;
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
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000999",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.endsWith("/images/preview")) {
          return Promise.resolve({ data: { previewImage: { assetId: "preview-ok" } } });
        }
        if (requestPath.endsWith("/images/gallery/batch")) {
          galleryAttempts += 1;
          const metadata = JSON.parse(options.body.get("metadata"));

          if (galleryAttempts > 1) {
            return Promise.resolve({
              data: {
                failed: [],
                succeeded: metadata.map((item, index) => ({
                  clientFileId: item.clientFileId,
                  image: { assetId: `gallery-retry-ok-${index}` },
                  index,
                  replayed: false
                }))
              },
              requestId: "req_gallery_retry"
            });
          }

          return Promise.resolve({
            data: {
              failed: [
                {
                  clientFileId: "00000000-0000-4000-8000-000000000404",
                  code: "IMAGE_TOO_LARGE",
                  index: 3,
                  message: "Файл должен быть не больше 5 MB."
                },
                {
                  clientFileId: "00000000-0000-4000-8000-000000000405",
                  code: "STORAGE_UPLOAD_FAILED",
                  index: 4,
                  message: "Не удалось загрузить изображение.",
                  requestId: "req_gallery_file_5"
                }
              ],
              succeeded: [0, 1, 2].map((index) => ({
                clientFileId: `00000000-0000-4000-8000-00000000040${index + 1}`,
                image: { assetId: `gallery-ok-${index}` },
                index,
                replayed: false
              }))
            },
            requestId: "req_gallery_partial"
          });
        }
        throw new Error(`Unexpected multipart path ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-000000000301",
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402",
        "00000000-0000-4000-8000-000000000403",
        "00000000-0000-4000-8000-000000000404",
        "00000000-0000-4000-8000-000000000405"
      ])
    });

    await screen.load();
    setValue(screen.element, "title", "Gallery partial request");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    const retryGalleryFiles = [
      imageFile("gallery-1.webp", "image/webp", 12),
      imageFile("gallery-2.webp", "image/webp", 12),
      imageFile("gallery-3.webp", "image/webp", 12),
      imageFile("gallery-4.webp", "image/webp", 12),
      imageFile("gallery-5.webp", "image/webp", 12)
    ];
    setFiles(screen.element, "previewImage", [imageFile("main.png", "image/png", 12)]);
    setFiles(screen.element, "galleryBatchImages", retryGalleryFiles);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Карточка сохранена. Часть изображений не загрузилась."));

    expect(screen.element.textContent).toContain("4 успешно");
    expect(screen.element.textContent).toContain("2 ошибки");
    for (const fileName of [
      "main.png",
      "gallery-1.webp",
      "gallery-2.webp",
      "gallery-3.webp",
      "gallery-4.webp",
      "gallery-5.webp"
    ]) {
      expect(screen.element.textContent).toContain(fileName);
    }
    expect(screen.element.textContent).toContain("Файл должен быть не больше 5 MB.");
    expect(screen.element.textContent).toContain("Не удалось загрузить изображение.");
    expect(screen.element.textContent).toContain("req_gallery_partial");
    expect(screen.element.textContent).toContain("req_gallery_file_5");
    expect(screen.element.textContent).toContain("Скопировать requestId");
    expect(screen.element.textContent).not.toMatch(/prisma|sql|storage\/v1/i);
    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);

    screen.element.querySelector('[data-action="retry-image-upload"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => requests.filter((request) => request.requestPath.endsWith("/images/gallery/batch")).length === 2);

    const galleryRequests = requests.filter((request) => request.requestPath.endsWith("/images/gallery/batch"));
    expect(JSON.parse(galleryRequests[1].options.body.get("metadata")).map((item) => item.clientFileId)).toEqual([
      "00000000-0000-4000-8000-000000000404",
      "00000000-0000-4000-8000-000000000405"
    ]);
    expect(galleryRequests[1].options.body.getAll("images")).toHaveLength(2);
    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
  });

  it("uses the readiness attempt timeout for save preflight without changing ordinary GET timeout", async () => {
    const documentRef = createFakeDocument();
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
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000919",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
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
    setValue(screen.element, "title", "Readiness timeout");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => requests.some((request) => request.requestPath === "/api/admin/sites"));

    const categoryGet = requests.find((request) => request.requestPath.startsWith("/api/admin/categories"));
    const readiness = requests.find((request) => request.requestPath === "/api/ready");

    expect(categoryGet.options.timeoutMs).toBeUndefined();
    expect(readiness.options.timeoutMs).toBe(ADMIN_REQUEST_TIMEOUTS.readinessAttempt);
  });

  it("does not show success, clear draft, or clear selected files when create response identity is malformed", async () => {
    const documentRef = createFakeDocument();
    const storage = createMemoryStorage();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000920",
              slug: "different-slug",
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      draftAutosaveMs: 1,
      mode: "create",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor",
      storage
    });

    await screen.load();
    setValue(screen.element, "title", "Malformed create");
    setValue(screen.element, "slug", "malformed-create");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("preview.png", "image/png", 12)]);
    await waitFor(() => storage.setItem.mock.calls.length > 0);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(onSaved).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(screen.element.querySelector("form")).not.toBeNull();
    expect(screen.element.querySelector('[name="title"]').value).toBe("Malformed create");
    expect(screen.element.querySelector('[name="previewImage"]').files[0].name).toBe("preview.png");
    expect(apiClient.requestMultipart).not.toHaveBeenCalled();
  });

  it("preserves selected create files, requestId UX, and stable retry after an HTTP 500", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    let createAttempts = 0;
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
          createAttempts += 1;
          if (createAttempts === 1) {
            return Promise.reject({
              code: "INTERNAL_ERROR",
              message:
                "PrismaClientKnownRequestError P2010 SELECT pg_advisory_xact_lock secret-title",
              requestId: "req_create_raw_lock",
              status: 500
            });
          }

          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000930",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.endsWith("/images/preview")) {
          return Promise.resolve({
            data: {
              previewImage: {
                assetId: "preview-after-retry",
                url: "https://storage.example.test/preview-after-retry.webp"
              }
            }
          });
        }
        if (requestPath.endsWith("/images/gallery/batch")) {
          return Promise.resolve({
            data: {
              failed: [],
              succeeded: JSON.parse(options.body.get("metadata")).map((item, index) => ({
                clientFileId: item.clientFileId,
                image: { assetId: `gallery-after-retry-${index}` },
                index,
                replayed: false
              }))
            }
          });
        }
        throw new Error(`Unexpected multipart path ${requestPath}`);
      })
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor",
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-000000000931",
        "00000000-0000-4000-8000-000000000941",
        "00000000-0000-4000-8000-000000000942",
        "00000000-0000-4000-8000-000000000943",
        "00000000-0000-4000-8000-000000000944",
        "00000000-0000-4000-8000-000000000945"
      ])
    });

    await screen.load();
    setValue(screen.element, "title", "Дом для Буси");
    setValue(screen.element, "slug", "dom-dlya-busi");
    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    setFiles(screen.element, "previewImage", [imageFile("preview-busi.png", "image/png", 12)]);
    setValue(screen.element, "previewAlt", "Preview alt");
    setFiles(screen.element, "galleryBatchImages", [
      imageFile("gallery-1.webp", "image/webp", 12),
      imageFile("gallery-2.webp", "image/webp", 12),
      imageFile("gallery-3.webp", "image/webp", 12),
      imageFile("gallery-4.webp", "image/webp", 12),
      imageFile("gallery-5.webp", "image/webp", 12)
    ]);
    setValue(screen.element, "galleryBatchAlt", "Gallery alt");

    const originalForm = screen.element.querySelector("form");
    const originalPreviewInput = screen.element.querySelector('[name="previewImage"]');
    const originalGalleryInput = screen.element.querySelector('[name="galleryBatchImages"]');

    originalForm.dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("req_create_raw_lock"));

    const createRequestsAfterFailure = requests.filter((request) => request.requestPath === "/api/admin/sites");

    expect(createRequestsAfterFailure).toHaveLength(1);
    expect(apiClient.requestMultipart).not.toHaveBeenCalled();
    expect(screen.element.querySelector("form")).toBe(originalForm);
    expect(screen.element.querySelector('[name="previewImage"]')).toBe(originalPreviewInput);
    expect(screen.element.querySelector('[name="galleryBatchImages"]')).toBe(originalGalleryInput);
    expect(originalPreviewInput.files[0].name).toBe("preview-busi.png");
    expect(originalGalleryInput.files.map((file) => file.name)).toEqual([
      "gallery-1.webp",
      "gallery-2.webp",
      "gallery-3.webp",
      "gallery-4.webp",
      "gallery-5.webp"
    ]);
    expect(screen.element.querySelector('[name="title"]').value).toBe("Дом для Буси");
    expect(screen.element.querySelector('[data-action="save-site"]').disabled).toBe(false);
    expect(screen.element.textContent).toContain("Не удалось сохранить карточку.");
    expect(screen.element.textContent).toContain("req_create_raw_lock");
    expect(screen.element.textContent).toContain("Скопировать requestId");
    expect(screen.element.textContent).not.toContain("Передайте requestId разработчику");
    expect(screen.element.textContent).not.toMatch(/Prisma|P2010|pg_advisory|SELECT|secret-title/i);

    originalForm.dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Карточка и изображения сохранены."));

    const createRequests = requests.filter((request) => request.requestPath === "/api/admin/sites");
    const previewRequests = requests.filter((request) => request.requestPath.endsWith("/images/preview"));
    const galleryRequests = requests.filter((request) => request.requestPath.endsWith("/images/gallery/batch"));

    expect(createRequests).toHaveLength(2);
    expect(createRequests[1].options.headers["X-Request-Id"]).toBe(
      createRequests[0].options.headers["X-Request-Id"]
    );
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0].options.body.get("clientFileId")).toBe(
      "00000000-0000-4000-8000-000000000931"
    );
    expect(galleryRequests).toHaveLength(1);
    expect(JSON.parse(galleryRequests[0].options.body.get("metadata")).map((item) => item.clientFileId)).toEqual([
      "00000000-0000-4000-8000-000000000941",
      "00000000-0000-4000-8000-000000000942",
      "00000000-0000-4000-8000-000000000943",
      "00000000-0000-4000-8000-000000000944",
      "00000000-0000-4000-8000-000000000945"
    ]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not accept a malformed update response as a saved edit", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "GET") {
          return Promise.resolve({ data: siteFixture() });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "PATCH") {
          return Promise.resolve({ data: null });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
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
    setValue(screen.element, "title", "Edited title");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.element.querySelector("form")).not.toBeNull();
    expect(screen.element.querySelector('[name="title"]').value).toBe("Edited title");
  });

  it("keeps server save available when local draft storage throws", async () => {
    const documentRef = createFakeDocument();
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("quota", "QuotaExceededError");
      })
    };
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites") {
          return Promise.resolve({
            data: siteFixture({
              id: "00000000-0000-4000-8000-000000000921",
              slug: options.body.slug,
              title: options.body.title
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
    };
    const onSaved = vi.fn();
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      draftAutosaveMs: 1,
      mode: "create",
      onCancel: vi.fn(),
      onSaved,
      onStatus: vi.fn(),
      role: "editor",
      storage
    });

    await screen.load();
    setValue(screen.element, "title", "Storage blocked");
    await waitFor(() => screen.element.textContent.includes("Локальное автосохранение недоступно."));
    expect(screen.element.textContent).toContain("Локальное автосохранение недоступно.");

    setValue(screen.element, "categoryId", "00000000-0000-4000-8000-000000000001");
    setValue(screen.element, "shortDescription", "Short");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      slug: "storage-blocked"
    }));
  });
});

function setValue(root, name, value) {
  const input = root.querySelector(`[name="${name}"]`);
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(fakeEvent("input"));
  input.dispatchEvent(fakeEvent("change"));
}

function setFiles(root, name, files) {
  const input = root.querySelector(`[name="${name}"]`);
  expect(input).not.toBeNull();
  input.files = files;
  input.dispatchEvent(fakeEvent("change"));
}

function imageFile(name, type, size) {
  return { name, size, type };
}

function createUuidSequence(values) {
  let index = 0;

  return () => values[index++];
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
  const listeners = new Map();

  return {
    visibilityState: "visible",
    addEventListener(type, listener) {
      const items = listeners.get(type) ?? [];
      items.push(listener);
      listeners.set(type, items);
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createTextNode(text) {
      return new FakeTextNode(text);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener.call(this, event);
      }
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
    removeEventListener(type, listener) {
      const items = listeners.get(type) ?? [];
      listeners.set(type, items.filter((item) => item !== listener));
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

function userFacingCopy(root) {
  return [
    ...root.querySelectorAll("label"),
    ...root.querySelectorAll("button"),
    ...root.querySelectorAll("h2"),
    ...root.querySelectorAll("h3"),
    ...root.querySelectorAll("legend"),
    ...root.querySelectorAll("p").filter((node) => {
      const className = node.getAttribute("class") ?? "";

      return className.includes("admin-field-help") ||
        className.includes("admin-state") ||
        className.includes("admin-upload-selection");
    })
  ].map((node) => node.textContent).join(" ");
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
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
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
