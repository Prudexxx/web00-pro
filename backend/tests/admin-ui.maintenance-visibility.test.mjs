import { describe, expect, it, vi } from "vitest";

import { createMaintenanceScreen } from "../src/admin/assets/screens/maintenance.js";
import { createSitesListScreen } from "../src/admin/assets/screens/sites-list.js";
import {
  click,
  createFakeDocument,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

const SITE_ID = "00000000-0000-4000-8000-000000000101";

describe("OPV2-6 ordinary maintenance visibility", () => {
  it("keeps publish/unpublish/delete/restore out of ordinary visible site-list action rows until overflow is opened", async () => {
    for (const site of [
      siteFixture({ status: "draft" }),
      siteFixture({ status: "published" }),
      siteFixture({ active: false, deletedAt: "2026-08-04T00:00:00.000Z", status: "draft" })
    ]) {
      const screen = await renderSitesList(site);
      const ordinaryActions = screen.element.querySelectorAll("button")
        .filter((button) => hasAncestorClass(button, "admin-site-actions"))
        .filter((button) => !hasAncestorAttribute(button, "data-overflow-menu", "true"));

      expect(ordinaryActions.map((button) => button.textContent)).toEqual(["Редактировать", "Изображения"]);
      expect(screen.element.querySelectorAll('[data-action="site-row-overflow"]')).toHaveLength(1);
      const overflowToggle = screen.element.querySelector('[data-action="site-row-overflow"]');
      expect(overflowToggle.getAttribute("aria-haspopup")).toBe("menu");
      expect(overflowToggle.getAttribute("aria-label")).toBe(`Действия сайта: ${site.title}`);
      const overflowMenu = screen.element.querySelector('[data-overflow-menu="true"]');
      expect(overflowMenu).not.toBeNull();
      expect(overflowToggle.getAttribute("aria-controls")).toBe(overflowMenu.getAttribute("id"));
      expect(overflowMenu.hasAttribute("hidden")).toBe(true);

      overflowToggle.dispatchEvent({ defaultPrevented: false, key: "ArrowDown", preventDefault() {}, target: overflowToggle, type: "keydown" });
      expect(overflowMenu.hasAttribute("hidden")).toBe(false);
      expect(overflowMenu.querySelector("button").focused).toBe(true);

      const overflowActions = screen.element.querySelectorAll("button")
        .filter((button) => hasAncestorAttribute(button, "data-overflow-menu", "true"))
        .map((button) => button.textContent);
      if (site.deletedAt !== null && site.deletedAt !== undefined) {
        expect(overflowActions).toContain("Восстановить");
        expect(overflowActions).toContain("Удалить навсегда");
      } else if (site.status === "published") {
        expect(overflowActions).toContain("Снять с публикации");
        expect(overflowActions).toContain("Удалить");
      } else {
        expect(overflowActions).toContain("Опубликовать");
        expect(overflowActions).toContain("Удалить");
      }
    }
  });

  it("keeps public catalog recovery controls in an explicitly named expert diagnostics screen", async () => {
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath === "/api/admin/public-catalog/status") {
          return Promise.resolve({
            data: {
              currentItemsCount: 16,
              currentSnapshotPath: "public-catalog/v1/revisions/7/catalog.json",
              desiredRevision: 7,
              publishedRevision: 7,
              showDemoInModal: true,
              syncStatus: "ready"
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    };
    const screen = createMaintenanceScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expect(screen.element.textContent).toContain("Восстановление и диагностика");
    expect(screen.element.querySelectorAll('[data-expert-recovery-screen="true"]')).toHaveLength(1);
    expect(screen.element.querySelector('[data-action="sync-public-catalog"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-action="public-catalog-dry-run"]')).not.toBeNull();
    expect(screen.element.querySelector('[data-action="save-public-catalog-settings"]')).toBeNull();
    expect(screen.element.querySelector('[data-field="show-demo-in-modal"]')).toBeNull();
    expect(screen.element.querySelector('[data-field="show-demo-in-modal-readonly"]')).not.toBeNull();
    expect(screen.element.textContent).not.toContain("Сохранить настройку демо");
  });

  it("ordinary site-list overflow destructive actions still require confirmation", async () => {
    const requests = [];
    const screen = await renderSitesList(siteFixture({ status: "published" }), {
      onRequest(requestPath, options = {}) {
        requests.push({ options, requestPath });
        if (requestPath === `/api/admin/sites/${SITE_ID}`) {
          return Promise.resolve({ data: siteFixture({ status: "published" }) });
        }
        if (requestPath === "/api/admin/publication/pages/card/synthetic-site") {
          return Promise.resolve({
            data: {
              blobSha: "sha-existing",
              card: {
                id: "synthetic-site",
                slug: "synthetic-site"
              },
              cardId: "synthetic-site"
            }
          });
        }
        if (requestPath === "/api/admin/publication/pages") {
          return Promise.resolve({
            data: {
              action: "update",
              buttonLabel: "Опубликовано",
              cardId: "synthetic-site",
              noOp: false,
              operationId: "00000000-0000-4000-8000-000000000701",
              requestId: "00000000-0000-4000-8000-000000000701",
              retryable: false,
              stableStatus: "Опубликовано",
              status: "published",
              statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000701"
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }
    });

    expect(screen.element.querySelector('[data-action="site-row-overflow"]')).not.toBeNull();
    click(screen.element, '[data-action="site-row-overflow"]');
    click(screen.element, '[data-lifecycle-action="unpublish"]');
    expect(requests).toEqual([]);

    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => requests.some((request) => request.requestPath === "/api/admin/publication/pages"));
  });
});

async function renderSitesList(site, options = {}) {
  const documentRef = createFakeDocument();
  const apiClient = {
    requestJson: vi.fn((requestPath, requestOptions = {}) => {
      if (requestPath === "/api/admin/categories?limit=100&page=1") {
        return Promise.resolve({ data: [], meta: metaFixture(0) });
      }
      if (requestPath === "/api/admin/sites") {
        return Promise.resolve({ data: [site], meta: metaFixture(1) });
      }
      if (typeof options.onRequest === "function") {
        return options.onRequest(requestPath, requestOptions);
      }
      throw new Error(`Unexpected request ${requestPath}`);
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
  return screen;
}

function siteFixture(overrides = {}) {
  return {
    active: true,
    categoryId: "00000000-0000-4000-8000-000000000201",
    category: { title: "Synthetic Category" },
    deletedAt: null,
    id: SITE_ID,
    previewImageUrl: "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/synthetic/preview/main/1200.webp",
    shortDescription: "Synthetic short description",
    slug: "synthetic-site",
    status: "draft",
    title: "Synthetic Site",
    views: 0,
    ...overrides
  };
}

function metaFixture(total) {
  return {
    limit: 20,
    page: 1,
    total,
    totalPages: 1
  };
}

function hasAncestorAttribute(node, name, value) {
  let current = node.parentNode;
  while (current !== null && current !== undefined) {
    if (current.getAttribute?.(name) === value) {
      return true;
    }
    current = current.parentNode;
  }

  return false;
}

function hasAncestorClass(node, className) {
  let current = node.parentNode;
  while (current !== null && current !== undefined) {
    if ((current.getAttribute?.("class") ?? "").split(/\s+/).includes(className)) {
      return true;
    }
    current = current.parentNode;
  }

  return false;
}
