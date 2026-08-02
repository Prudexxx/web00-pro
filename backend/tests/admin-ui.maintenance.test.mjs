import { describe, expect, it, vi } from "vitest";

import { bootstrapAdminApp } from "../src/admin/assets/main.js";
import { createMaintenanceScreen } from "../src/admin/assets/screens/maintenance.js";
import { visibleNavigation } from "../src/admin/assets/screens/shell.js";
import {
  click,
  createFakeDocument,
  setValue,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin maintenance canonical assets screen", () => {
  it("keeps maintenance navigation and screen admin-only", async () => {
    expect(visibleNavigation("editor").map((item) => item.id)).not.toContain("maintenance");
    expect(visibleNavigation("admin").map((item) => item.id)).toContain("maintenance");

    const documentRef = createFakeDocument();
    const apiClient = { requestJson: vi.fn() };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();

    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(screen.element.textContent).toContain("Недостаточно прав");
    expect(screen.element.textContent).not.toContain("Восстановить изображения");
  });

  it("keeps apply disabled before dry-run and enables it only for ready reports", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({ data: readyReport() }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    expect(screen.element.textContent).toContain("Восстановление канонических изображений");
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);

    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("mebel"));

    expect(screen.element.textContent).toContain("Планируемые preview: 3");
    expect(screen.element.textContent).toContain("Планируемые gallery URL: 12");
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(false);
  });

  it("loads public catalog controls without consuming canonical-assets API and fetches status explicitly", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath === "/api/admin/maintenance/canonical-assets") {
          return Promise.resolve({ data: readyReport() });
        }
        if (requestPath === "/api/admin/public-catalog/status") {
          return Promise.resolve({
            data: publicCatalogStatus({
              currentItemsCount: 16,
              currentSnapshotPath: "public-catalog/v1/revisions/7/catalog.json",
              showDemoInModal: true
            })
          });
        }
        throw new Error(`Unexpected path ${requestPath}`);
      })
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(screen.element.textContent).toContain("Публичный каталог");
    expect(screen.element.textContent).toContain("Статус публичного каталога ещё не загружен.");

    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("mebel"));
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(false);

    click(screen.element, '[data-action="check-public-catalog"]');
    await waitFor(() => screen.element.textContent.includes("DB mutation result: ready"));

    expect(screen.element.textContent).toContain("Revision: desired 7, published 7");
    expect(screen.element.textContent).toContain("Snapshot: public-catalog/v1/revisions/7/catalog.json");
    expect(screen.element.querySelector('[data-field="show-demo-in-modal"]').checked).toBe(true);
    expect(apiClient.requestJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/admin/maintenance/canonical-assets",
      "/api/admin/public-catalog/status"
    ]);
  });

  it("rejects malformed public catalog status responses", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: publicCatalogStatus({
          currentItemsCount: "sixteen"
        })
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-public-catalog"]');
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));
  });

  it("renders Russian preview state labels including legacy normalization", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: {
          ...readyReport(),
          targets: [
            targetReport("mebel", {
              plannedPreviewUpdate: true,
              previewState: "missing"
            }),
            targetReport("massage", {
              plannedPreviewUpdate: true,
              previewState: "legacy-canonical"
            }),
            targetReport("drova", {
              plannedPreviewUpdate: false,
              previewState: "already-canonical"
            })
          ]
        }
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("Legacy Preview будет нормализован"));

    expect(screen.element.textContent).toContain("Preview отсутствует");
    expect(screen.element.textContent).toContain("Legacy Preview будет нормализован");
    expect(screen.element.textContent).toContain("Preview уже канонический");
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(false);
  });

  it("keeps apply disabled when dry-run has blockers", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: {
          ...readyReport(),
          blockers: ["GALLERY_URL_MISMATCH:mebel:0"],
          status: "blocked",
          targets: [
            {
              ...readyReport().targets[0],
              blockers: ["GALLERY_URL_MISMATCH:mebel:0"],
              gallerySourceMatch: false
            },
            ...readyReport().targets.slice(1)
          ]
        }
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("GALLERY_URL_MISMATCH:mebel:0"));

    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);
  });

  it("renders preview conflict labels and keeps apply disabled", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: {
          ...readyReport(),
          blockers: ["PREVIEW_URL_CONFLICT:mebel"],
          status: "blocked",
          targets: [
            targetReport("mebel", {
              blockers: ["PREVIEW_URL_CONFLICT:mebel"],
              plannedPreviewUpdate: false,
              previewState: "blocked"
            }),
            ...readyReport().targets.slice(1)
          ]
        }
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("Конфликт Preview"));

    expect(screen.element.textContent).toContain("PREVIEW_URL_CONFLICT:mebel");
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);
  });

  it("requires exact confirmation and renders success copy that cards remain drafts", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (options.method === "POST") {
          return Promise.resolve({
            data: {
              ...readyReport(),
              mode: "apply",
              status: "applied",
              totals: { ...readyReport().totals, appliedSiteUpdates: 3 }
            }
          });
        }
        return Promise.resolve({ data: readyReport() });
      })
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');

    expect(screen.element.querySelector('[data-action="confirm-dialog"]').disabled).toBe(true);
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    expect(screen.element.querySelector('[data-action="confirm-dialog"]').disabled).toBe(false);
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("Канонические изображения восстановлены."));

    expect(screen.element.textContent).toContain("Карточки остались черновиками и не опубликованы.");
    expect(requests.find((request) => request.options.method === "POST")).toMatchObject({
      options: {
        body: { confirmation: "WEB00-CANONICAL-ASSETS-15-7" },
        method: "POST"
      },
      requestPath: "/api/admin/maintenance/canonical-assets/reconcile"
    });
  });

  it("renders already-reconciled copy and requestId copy on failure without technical DB output", async () => {
    const documentRef = createFakeDocument();
    const responses = [
      () => Promise.resolve({ data: readyReport() }),
      () => Promise.resolve({
        data: {
          ...readyReport(),
          mode: "apply",
          status: "already-reconciled",
          totals: {
            appliedSiteUpdates: 0,
            plannedGalleryUrlUpdates: 0,
            plannedPreviewUpdates: 0,
            targetSites: 3
          }
        }
      }),
      () => Promise.resolve({ data: readyReport() }),
      () => Promise.reject({
        code: "RECONCILIATION_STATE_CHANGED",
        message: "Данные карточек изменились. Повторите проверку состояния.",
        requestId: "req_maintenance_failure"
      })
    ];
    const apiClient = {
      requestJson: vi.fn(() => responses.shift()())
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("Канонические изображения уже восстановлены."));

    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("req_maintenance_failure"));

    expect(screen.element.textContent).toContain("Скопировать requestId");
    expect(screen.element.textContent).not.toMatch(/DATABASE_URL|Prisma|postgres:\/\/|token|cookie|password/i);
  });

  it("shows blocked apply failure copy without ever showing a generic completed message", async () => {
    const documentRef = createFakeDocument();
    const responses = [
      () => Promise.resolve({ data: readyReport() }),
      () => Promise.reject({
        code: "RECONCILIATION_PRECONDITION_FAILED",
        message: "Восстановление не выполнено. Повторите проверку состояния.",
        requestId: "req_apply_blocked"
      })
    ];
    const apiClient = {
      requestJson: vi.fn(() => responses.shift()())
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("req_apply_blocked"));

    expect(screen.element.textContent).toContain("Восстановление не выполнено. Повторите проверку состояния.");
    expect(screen.element.textContent).not.toContain("Восстановление canonical assets завершено.");
  });

  it("rejects malformed dry-run reports and keeps apply disabled", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: {
          ...readyReport(),
          totals: {
            ...readyReport().totals,
            targetSites: 2
          }
        }
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);
  });

  it("rejects dry-run reports with wrong target slugs", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: {
          ...readyReport(),
          targets: [
            targetReport("mebel"),
            targetReport("massage"),
            targetReport("not-canonical")
          ]
        }
      }))
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);
  });

  it("rejects malformed apply success responses and disables apply until a new dry-run", async () => {
    const documentRef = createFakeDocument();
    const responses = [
      () => Promise.resolve({ data: readyReport() }),
      () => Promise.resolve({
        data: {
          ...readyReport(),
          mode: "apply",
          status: "applied",
          totals: {
            ...readyReport().totals,
            appliedSiteUpdates: 0
          }
        }
      })
    ];
    const apiClient = {
      requestJson: vi.fn(() => responses.shift()())
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(screen.element.textContent).not.toContain("Канонические изображения восстановлены.");
    expect(screen.element.textContent).not.toContain("Восстановление canonical assets завершено.");
    expect(screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled).toBe(true);
  });

  it("shows safe unexpected failure copy with requestId control", async () => {
    const documentRef = createFakeDocument();
    const responses = [
      () => Promise.resolve({ data: readyReport() }),
      () => Promise.reject({
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req_apply_500"
      })
    ];
    const apiClient = {
      requestJson: vi.fn(() => responses.shift()())
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="check-canonical-assets"]');
    await waitFor(() => screen.element.querySelector('[data-action="apply-canonical-assets"]').disabled === false);
    click(screen.element, '[data-action="apply-canonical-assets"]');
    setValue(screen.element, "typedConfirmation", "WEB00-CANONICAL-ASSETS-15-7");
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("req_apply_500"));

    expect(screen.element.textContent).toContain("Не удалось восстановить изображения.");
    expect(screen.element.textContent).toContain("Скопировать requestId");
    expect(screen.element.textContent).not.toMatch(/Prisma|DATABASE_URL|postgres:\/\/|token|cookie|password/i);
  });

  it("bootstrapped admin shell can open maintenance but editor shell cannot", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      fetchImpl: createBootstrapFetch("admin"),
      root
    });

    expect(root.querySelector('[data-section="maintenance"]')).not.toBeNull();
    click(root, '[data-section="maintenance"]');
    expect(root.textContent).toContain("Восстановление канонических изображений");

    const editorDocument = createFakeDocument();
    const editorRoot = editorDocument.createElement("main");
    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef: editorDocument,
      fetchImpl: createBootstrapFetch("editor"),
      root: editorRoot
    });

    expect(editorRoot.querySelector('[data-section="maintenance"]')).toBeNull();
  });
});

function readyReport() {
  return {
    blockers: [],
    mode: "dry-run",
    status: "ready",
    targets: [
      targetReport("mebel"),
      targetReport("massage"),
      targetReport("drova")
    ],
    totals: {
      appliedSiteUpdates: 0,
      plannedGalleryUrlUpdates: 12,
      plannedPreviewUpdates: 3,
      targetSites: 3
    }
  };
}

function publicCatalogStatus(overrides = {}) {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 7,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 7,
    showDemoInModal: false,
    syncStatus: "ready",
    ...overrides
  };
}

function targetReport(slug, overrides = {}) {
  return {
    active: true,
    blockers: [],
    categoryMatch: true,
    deleted: false,
    found: true,
    galleryCount: 4,
    gallerySourceMatch: true,
    plannedGalleryUrlUpdates: 4,
    plannedPreviewUpdate: true,
    previewState: "missing",
    slug,
    status: "draft",
    titleMatch: true,
    ...overrides
  };
}

function createBootstrapFetch(role) {
  const user = {
    email: `${role}@example.test`,
    id: role === "admin"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000002",
    role
  };

  return vi.fn((requestPath) => {
    if (requestPath === "/api/auth/refresh") {
      return Promise.resolve(jsonResponse(200, {
        data: { accessToken: `${role}-token`, user }
      }));
    }
    if (requestPath === "/api/auth/me") {
      return Promise.resolve(jsonResponse(200, { data: { user } }));
    }
    throw new Error(`Unexpected path ${requestPath}`);
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
