import { describe, expect, it, vi } from "vitest";

import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";
import {
  createDeferred,
  createFakeDocument,
  fakeEvent,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const SITE_ID = "00000000-0000-4000-8000-000000000101";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";

describe("Direct Pages modal demo setting switch", () => {
  it("renders a premium autosaving switch with default ON and no separate save-setting control", async () => {
    const screen = await renderEditor();

    const switchControl = screen.element.querySelector('[role="switch"]');
    expect(switchControl).not.toBeNull();
    expect(switchControl.tagName).toBe("button");
    expect(switchControl.getAttribute("aria-checked")).toBe("true");
    expect(switchControl.disabled).toBe(false);
    expect(switchControl.textContent).toContain("Открывать демо внутри WEB00");
    expect(screen.element.textContent).toContain("Сохранено");
    expect(screen.element.querySelector('[data-action="save-public-catalog-settings"]')).toBeNull();
    expect(screen.element.querySelector('[data-field="show-demo-in-modal"]')).toBeNull();
  });

  it("uses the backend status value as the confirmed default before autosave", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/admin/public-catalog/status" && options.method === "GET") {
          return Promise.resolve({
            data: {
              status: {
                showDemoInModal: false
              }
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    const switchControl = screen.element.querySelector('[role="switch"]');
    expect(switchControl).not.toBeNull();
    expect(switchControl.getAttribute("aria-checked")).toBe("false");
  });

  it("autosaves settings, observes catalog sync status, and never publishes the edited site", async () => {
    const requests = [];
    const firstSettings = createDeferred();
    const statusAfterSettings = createDeferred();
    let statusReads = 0;
    const apiClient = createEditorApi((requestPath, options = {}) => {
      requests.push({ options, requestPath });
      if (requestPath === "/api/admin/public-catalog/settings" && options.method === "PATCH") {
        return firstSettings.promise;
      }
      if (requestPath === "/api/admin/public-catalog/status" && options.method === "GET") {
        statusReads += 1;
        if (statusReads === 1) {
          return Promise.resolve({
            data: {
              showDemoInModal: true,
              syncStatus: "ready"
            }
          });
        }
        return statusAfterSettings.promise;
      }
      throw new Error(`Unexpected request ${requestPath}`);
    });
    const screen = await renderEditor({
      apiClient,
      uuidFactory: createUuidSequence(["00000000-0000-4000-8000-0000000000e1"])
    });
    const switchControl = screen.element.querySelector('[role="switch"]');
    expect(switchControl).not.toBeNull();

    switchControl.dispatchEvent(fakeEvent("click"));
    switchControl.dispatchEvent(fakeEvent("click"));
    switchControl.dispatchEvent(fakeEvent("click"));

    await waitFor(() => requests.some((request) => request.requestPath === "/api/admin/public-catalog/settings"));
    expect(requests.filter((request) => request.requestPath === "/api/admin/public-catalog/settings")).toHaveLength(1);
    expect(requests.find((request) => request.requestPath === "/api/admin/public-catalog/settings").options.body).toEqual({
      showDemoInModal: false
    });
    expect(switchControl.getAttribute("aria-checked")).toBe("false");
    expect(switchControl.disabled).toBe(false);
    expect(switchControl.getAttribute("aria-busy")).toBe("true");
    expect(screen.element.textContent).toContain("Публикуется");

    firstSettings.resolve({
      data: {
        status: {
          showDemoInModal: false
        },
        sync: {
          desiredRevision: 8,
          publishedRevision: 7,
          requestId: "req_public_catalog_sync",
          status: "pending"
        }
      }
    });
    await waitFor(() => requests.filter((request) => request.requestPath === "/api/admin/public-catalog/status").length === 2);
    statusAfterSettings.resolve({
      data: {
        showDemoInModal: false,
        syncStatus: "ready"
      }
    });
    await waitFor(() => screen.element.querySelector('[data-demo-switch-status="true"]').textContent === "Сохранено");

    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(0);
    expect(switchControl.getAttribute("aria-checked")).toBe("false");
    expect(JSON.stringify(requests)).not.toMatch(/accessToken|cookie|password|secret|requestFingerprint/i);
  });

  it("keyboard toggles the switch and request failure restores the confirmed value without a save button", async () => {
    const apiClient = createEditorApi((requestPath, options = {}) => {
      if (requestPath === "/api/admin/public-catalog/settings" && options.method === "PATCH") {
        return Promise.reject({
          code: "NETWORK_ERROR",
          message: "Network lost.",
          requestId: "req_demo_switch_failed",
          status: 0
        });
      }
      throw new Error(`Unexpected request ${requestPath}`);
    });
    const screen = await renderEditor({ apiClient });
    const switchControl = screen.element.querySelector('[role="switch"]');
    expect(switchControl).not.toBeNull();

    switchControl.dispatchEvent(fakeEvent("keydown", { key: " " }));

    await waitFor(() => screen.element.textContent.includes("Ошибка"));
    expect(screen.element.textContent).toContain("req_demo_switch_failed");
    expect(switchControl.getAttribute("aria-checked")).toBe("true");
    expect(screen.element.querySelector('[data-action="save-public-catalog-settings"]')).toBeNull();
  });

  it("does not report a saved demo setting when the catalog sync result fails", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/admin/public-catalog/settings" && options.method === "PATCH") {
          return Promise.resolve({
            data: {
              status: {
                showDemoInModal: false
              },
              sync: {
                errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
                publishedRevision: 7,
                requestId: "req_public_catalog_sync_failed",
                status: "failed"
              }
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    const switchControl = screen.element.querySelector('[role="switch"]');
    switchControl.dispatchEvent(fakeEvent("click"));

    await waitFor(() => screen.element.querySelector('[data-demo-switch-status="true"]').textContent.startsWith("Ошибка"));

    expect(screen.element.querySelector('[data-demo-switch-status="true"]').textContent).toBe("Ошибка");
    expect(switchControl.getAttribute("aria-checked")).toBe("false");
    expect(screen.element.querySelector('[data-action="save-public-catalog-settings"]')).toBeNull();
    expect(screen.element.querySelector('[data-primary-publication-control="true"]').textContent).toBe("Опубликовать");
  });

  it("fails closed when the settings response does not confirm the persisted value", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/admin/public-catalog/settings" && options.method === "PATCH") {
          return Promise.resolve({
            data: {
              status: {},
              sync: {
                checksum: "a".repeat(64),
                itemsCount: 16,
                publishedRevision: 7,
                requestId: "req_public_catalog_sync",
                snapshotPath: "public-catalog/v1/snapshots/revision-7.json",
                status: "ready"
              }
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    const switchControl = screen.element.querySelector('[role="switch"]');
    switchControl.dispatchEvent(fakeEvent("click"));

    await waitFor(() => screen.element.querySelector('[data-demo-switch-status="true"]').textContent === "Ошибка");

    expect(switchControl.getAttribute("aria-checked")).toBe("true");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });

  it("does not flush queued demo setting mutations after the editor is destroyed", async () => {
    const settingsRequest = createDeferred();
    const requests = [];
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/admin/public-catalog/settings" && options.method === "PATCH") {
          return settingsRequest.promise;
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });
    const switchControl = screen.element.querySelector('[role="switch"]');

    switchControl.dispatchEvent(fakeEvent("click"));
    switchControl.dispatchEvent(fakeEvent("click"));
    await waitFor(() => requests.filter((request) => request.requestPath === "/api/admin/public-catalog/settings").length === 1);

    screen.destroy();
    settingsRequest.resolve({
      data: {
        status: {
          showDemoInModal: false
        },
        sync: {
          status: "ready"
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((request) => request.requestPath === "/api/admin/public-catalog/settings")).toHaveLength(1);
  });
});

async function renderEditor(options = {}) {
  const documentRef = createFakeDocument();
  const screen = createSiteEditorScreen({
    apiClient: options.apiClient ?? createEditorApi(),
    createRetryBackoffMs: 0,
    documentRef,
    mode: "edit",
    onCancel: vi.fn(),
    onImages: vi.fn(),
    onSaved: vi.fn(),
    onStatus: vi.fn(),
    pollIntervalMs: 0,
    role: "admin",
    siteId: SITE_ID,
    uuidFactory: options.uuidFactory ?? createUuidSequence(["00000000-0000-4000-8000-000000000099"])
  });

  await screen.load();
  return screen;
}

function createEditorApi(onRequest) {
  return {
    requestJson: vi.fn((requestPath, options = {}) => {
      if (requestPath === CATEGORY_PATH) {
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      }
      if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
        return Promise.resolve({ data: siteFixture() });
      }
      if (requestPath === "/api/admin/public-catalog/status" && options.method === "GET") {
        if (typeof onRequest === "function") {
          try {
            return onRequest(requestPath, options);
          } catch (error) {
            if (!String(error?.message ?? "").startsWith("Unexpected request ")) {
              throw error;
            }
          }
        }
        return Promise.resolve({
          data: {
            showDemoInModal: true,
            status: {
              showDemoInModal: true
            }
          }
        });
      }
      if (typeof onRequest === "function") {
        return onRequest(requestPath, options);
      }
      throw new Error(`Unexpected request ${requestPath}`);
    }),
    requestMultipart: vi.fn()
  };
}

function categoryFixture() {
  return {
    id: CATEGORY_ID,
    slug: "synthetic-category",
    title: "Synthetic Category"
  };
}

function siteFixture() {
  return {
    active: true,
    categoryId: CATEGORY_ID,
    deletedAt: null,
    id: SITE_ID,
    shortDescription: "Synthetic short description",
    slug: "synthetic-site",
    status: "draft",
    title: "Synthetic Site"
  };
}

function metaFixture(total) {
  return {
    limit: 100,
    page: 1,
    total,
    totalPages: 1
  };
}

function publicationDto(overrides = {}) {
  return {
    buttonLabel: "Публикуется…",
    operationId: "00000000-0000-4000-8000-00000000feed",
    retryable: false,
    stableStatus: "Публикуется",
    status: "queued",
    statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed",
    ...overrides
  };
}

function createUuidSequence(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
