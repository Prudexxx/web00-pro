import { describe, expect, it, vi } from "vitest";

import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";
import { createSitesListScreen } from "../src/admin/assets/screens/sites-list.js";
import {
  createFakeDocument,
  fakeEvent,
  setValue,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const SITE_ID = "00000000-0000-4000-8000-000000000101";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";
const REQUEST_ID = "00000000-0000-4000-8000-000000000601";
const STATUS_URL = `/api/admin/publication/pages/${REQUEST_ID}`;
const DELETE_REQUEST_ID = "00000000-0000-4000-8000-000000000604";
const DELETE_STATUS_URL = `/api/admin/publication/pages/${DELETE_REQUEST_ID}`;

describe("Direct Pages publication admin UI", () => {
  it("END-TO-END STATUS + UI publishes through Direct Pages endpoints without browser token exposure or false Pages success", async () => {
    const storage = createMemoryStorage();
    const requests = [];
    const screen = await renderEditor({
      apiClient: createEditorApi({
        onRequest(requestPath, options = {}) {
          requests.push({ options, requestPath });
          if (requestPath === "/api/ready") {
            return Promise.resolve({ status: "ready" });
          }
          if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
            return Promise.resolve({
              data: siteFixture({
                title: options.body.title,
                updatedAt: "2026-08-05T12:00:00.000Z"
              })
            });
          }
          if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
            return Promise.resolve({
              data: {
                blobSha: "sha-main-card",
                card: canonicalCard({ title: "Synthetic Site" }),
                cardId: "synthetic-site"
              }
            });
          }
          if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
            return Promise.resolve({
              data: publicationDto({
                buttonLabel: "Проверяется",
                prNumber: 42,
                stableStatus: "Проверяется",
                status: "validating"
              })
            });
          }
          if (requestPath === STATUS_URL && options.method === "GET") {
            return Promise.resolve({
              data: publicationDto({
                buttonLabel: "Развёртывается",
                prNumber: 42,
                stableStatus: "Развёртывается",
                status: "deploying"
              })
            });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        }
      }),
      storage,
      uuidFactory: createUuidSequence([REQUEST_ID])
    });

    setValue(screen.element, "title", "Direct Pages Updated");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => requests.some((request) => request.requestPath.includes("/publication")));

    const post = requests.find((request) => request.requestPath === "/api/admin/publication/pages");
    expect(requests.map((request) => request.requestPath)).not.toContain(`/api/admin/sites/${SITE_ID}/publication`);
    expect(post).toBeDefined();
    expect(post.options.body).toMatchObject({
      action: "update",
      cardId: "synthetic-site",
      expectedBlobSha: "sha-main-card",
      requestId: REQUEST_ID
    });
    expect(post.options.body.card).toMatchObject({
      category: "Synthetic Category",
      description: "Synthetic short description",
      id: "synthetic-site",
      previewImage: "https://storage.example.test/preview.webp",
      slug: "synthetic-site",
      title: "Direct Pages Updated"
    });
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Развёртывается");
    expect(JSON.parse(storage.getItem("web00_admin_publication_reconnect_v1"))).toMatchObject({
      operationId: REQUEST_ID,
      prNumber: 42,
      requestId: REQUEST_ID,
      siteId: SITE_ID,
      version: 2
    });
    expect(JSON.stringify({ requests, storage: storage.values() })).not.toMatch(
      /WEB00_GITHUB_TOKEN|github_pat|ghp_|Authorization|Bearer/i
    );

    const failedScreen = await renderEditor({
      apiClient: createEditorApi({
        onRequest(requestPath, options = {}) {
          if (requestPath === "/api/ready") {
            return Promise.resolve({ status: "ready" });
          }
          if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
            return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
          }
          if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
            return Promise.resolve({ data: { blobSha: "sha-main-card", card: canonicalCard(), cardId: "synthetic-site" } });
          }
          if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
            return Promise.resolve({
              data: publicationDto({
                buttonLabel: "Ошибка публикации",
                retryable: true,
                stableStatus: "Ошибка публикации",
                status: "failed"
              })
            });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        }
      }),
      uuidFactory: createUuidSequence(["00000000-0000-4000-8000-000000000602"])
    });

    setValue(failedScreen.element, "title", "Direct Pages Failed");
    failedScreen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => failedScreen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Ошибка публикации");
    expect(failedScreen.element.textContent).not.toContain("Опубликовано");

    const deleteRequests = [];
    const onDeleteStatus = vi.fn();
    const listScreen = createSitesListScreen({
      apiClient: {
        requestJson: vi.fn((requestPath, options = {}) => {
          deleteRequests.push({ options, requestPath });
          if (requestPath.startsWith("/api/admin/categories")) {
            return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
          }
          if (requestPath === "/api/admin/sites") {
            return Promise.resolve({ data: [siteFixture({ status: "published" })], meta: metaFixture(1) });
          }
          if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
            return Promise.resolve({ data: { blobSha: "sha-main-card", card: canonicalCard(), cardId: "synthetic-site" } });
          }
          if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
            return Promise.resolve({
              data: publicationDto({
                action: "delete",
                buttonLabel: "Проверяется",
                operationId: DELETE_REQUEST_ID,
                requestId: DELETE_REQUEST_ID,
                stableStatus: "Проверяется",
                status: "validating",
                statusUrl: DELETE_STATUS_URL
              })
            });
          }
          if (requestPath === DELETE_STATUS_URL && options.method === "GET") {
            return Promise.resolve({
              data: publicationDto({
                action: "delete",
                buttonLabel: "Опубликовано",
                operationId: DELETE_REQUEST_ID,
                requestId: DELETE_REQUEST_ID,
                stableStatus: "Опубликовано",
                status: "published",
                statusUrl: DELETE_STATUS_URL
              })
            });
          }
          if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "DELETE") {
            return Promise.resolve({ data: siteFixture({ deletedAt: "2026-08-05T12:00:00.000Z" }) });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        })
      },
      documentRef: createFakeDocument(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onImages: vi.fn(),
      onStatus: onDeleteStatus,
      pollIntervalMs: 0,
      role: "admin"
    });

    await listScreen.load();
    listScreen.element.querySelector('[data-lifecycle-action="soft-delete"]').dispatchEvent(fakeEvent("click"));
    listScreen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => deleteRequests.some((request) => request.requestPath === "/api/admin/publication/pages"));

    expect(deleteRequests.map((request) => request.requestPath)).not.toContain(`/api/admin/sites/${SITE_ID}`);
    expect(deleteRequests.find((request) => request.requestPath === "/api/admin/publication/pages").options.body).toMatchObject({
      action: "delete",
      card: null,
      cardId: "synthetic-site",
      expectedBlobSha: "sha-main-card"
    });
    await waitFor(() => expect(onDeleteStatus).toHaveBeenLastCalledWith("Опубликовано"));
  });

  it("LIFECYCLE routes publish/unpublish through Direct Pages and reconnects remembered polling after reload", async () => {
    const storage = createMemoryStorage();
    const publishRequests = [];
    const onPublishStatus = vi.fn();
    const publishScreen = createSitesListScreen({
      apiClient: createLifecycleApi({
        onRequest(requestPath, options = {}) {
          publishRequests.push({ options, requestPath });
          if (requestPath === "/api/admin/sites") {
            return Promise.resolve({ data: [siteFixture({ status: "draft" })], meta: metaFixture(1) });
          }
          if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
            return Promise.resolve({ data: siteFixture({ status: "draft" }) });
          }
          if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
            return Promise.resolve({ data: { blobSha: null, card: null, cardId: "synthetic-site" } });
          }
          if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
            return Promise.resolve({
              data: publicationDto({
                action: "create",
                buttonLabel: "Проверяется",
                operationId: "00000000-0000-4000-8000-000000000605",
                requestId: "00000000-0000-4000-8000-000000000605",
                stableStatus: "Проверяется",
                status: "validating",
                statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000605"
              })
            });
          }
          if (requestPath === "/api/admin/publication/pages/00000000-0000-4000-8000-000000000605" && options.method === "GET") {
            return Promise.resolve({
              data: publicationDto({
                action: "create",
                buttonLabel: "Опубликовано",
                operationId: "00000000-0000-4000-8000-000000000605",
                requestId: "00000000-0000-4000-8000-000000000605",
                stableStatus: "Опубликовано",
                status: "published",
                statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000605"
              })
            });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        }
      }),
      documentRef: createFakeDocument(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onImages: vi.fn(),
      onStatus: onPublishStatus,
      pollIntervalMs: 0,
      role: "admin",
      storage
    });

    await publishScreen.load();
    publishScreen.element.querySelector('[data-lifecycle-action="publish"]').dispatchEvent(fakeEvent("click"));
    publishScreen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => expect(onPublishStatus).toHaveBeenLastCalledWith("Опубликовано"));

    expect(publishRequests.map((request) => request.requestPath)).not.toContain(`/api/admin/sites/${SITE_ID}/publish`);
    expect(publishRequests.find((request) => request.requestPath === "/api/admin/publication/pages").options.body).toMatchObject({
      action: "create",
      cardId: "synthetic-site",
      expectedBlobSha: null
    });

    const unpublishRequests = [];
    const unpublishScreen = createSitesListScreen({
      apiClient: createLifecycleApi({
        onRequest(requestPath, options = {}) {
          unpublishRequests.push({ options, requestPath });
          if (requestPath === "/api/admin/sites") {
            return Promise.resolve({ data: [siteFixture({ status: "published" })], meta: metaFixture(1) });
          }
          if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
            return Promise.resolve({ data: siteFixture({ status: "published" }) });
          }
          if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
            return Promise.resolve({ data: { blobSha: "sha-main-card", card: canonicalCard(), cardId: "synthetic-site" } });
          }
          if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
            return Promise.resolve({
              data: publicationDto({
                action: "update",
                buttonLabel: "Проверяется",
                operationId: "00000000-0000-4000-8000-000000000606",
                requestId: "00000000-0000-4000-8000-000000000606",
                stableStatus: "Проверяется",
                status: "validating",
                statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000606"
              })
            });
          }
          if (requestPath === "/api/admin/publication/pages/00000000-0000-4000-8000-000000000606" && options.method === "GET") {
            return Promise.resolve({
              data: publicationDto({
                action: "update",
                buttonLabel: "Опубликовано",
                operationId: "00000000-0000-4000-8000-000000000606",
                requestId: "00000000-0000-4000-8000-000000000606",
                stableStatus: "Опубликовано",
                status: "published",
                statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000606"
              })
            });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        }
      }),
      documentRef: createFakeDocument(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onImages: vi.fn(),
      onStatus: vi.fn(),
      pollIntervalMs: 0,
      role: "admin",
      storage: createMemoryStorage()
    });

    await unpublishScreen.load();
    unpublishScreen.element.querySelector('[data-lifecycle-action="unpublish"]').dispatchEvent(fakeEvent("click"));
    unpublishScreen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => unpublishRequests.some((request) => request.requestPath === "/api/admin/publication/pages"));

    expect(unpublishRequests.map((request) => request.requestPath)).not.toContain(`/api/admin/sites/${SITE_ID}/unpublish`);
    expect(unpublishRequests.find((request) => request.requestPath === "/api/admin/publication/pages").options.body).toMatchObject({
      action: "update",
      card: expect.objectContaining({ active: false }),
      cardId: "synthetic-site",
      expectedBlobSha: "sha-main-card"
    });

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-000000000607",
      requestId: "00000000-0000-4000-8000-000000000607",
      siteId: SITE_ID,
      updatedAt: "2026-08-05T12:00:00.000Z",
      version: 2
    }));
    const reloadRequests = [];
    const onReloadStatus = vi.fn();
    const reloadScreen = createSitesListScreen({
      apiClient: createLifecycleApi({
        onRequest(requestPath, options = {}) {
          reloadRequests.push({ options, requestPath });
          if (requestPath === "/api/admin/sites") {
            return Promise.resolve({ data: [siteFixture({ status: "published" })], meta: metaFixture(1) });
          }
          if (requestPath === "/api/admin/publication/pages/00000000-0000-4000-8000-000000000607" && options.method === "GET") {
            return Promise.resolve({
              data: publicationDto({
                buttonLabel: "Развёртывается",
                operationId: "00000000-0000-4000-8000-000000000607",
                requestId: "00000000-0000-4000-8000-000000000607",
                stableStatus: "Развёртывается",
                status: "deploying",
                statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000607"
              })
            });
          }
          throw new Error(`Unexpected request ${requestPath}`);
        }
      }),
      documentRef: createFakeDocument(),
      onCreate: vi.fn(),
      onEdit: vi.fn(),
      onImages: vi.fn(),
      onStatus: onReloadStatus,
      pollIntervalMs: 0,
      role: "admin",
      storage
    });

    await reloadScreen.load();

    expect(reloadRequests.map((request) => request.requestPath)).toContain("/api/admin/publication/pages/00000000-0000-4000-8000-000000000607");
    expect(onReloadStatus).toHaveBeenLastCalledWith("Развёртывается");
  });

  it("SLUG IMMUTABILITY rejects edit-time slug rename before local save or GitHub mutation", async () => {
    const requests = [];
    const screen = await renderEditor({
      apiClient: createEditorApi({
        onRequest(requestPath, options = {}) {
          requests.push({ options, requestPath });
          throw new Error(`Unexpected request ${requestPath}`);
        }
      })
    });

    setValue(screen.element, "slug", "renamed-site");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Адрес карточки"));

    expect(requests).toEqual([]);
    expect(screen.element.textContent).toContain("Адрес карточки");
  });
});

async function renderEditor(options = {}) {
  const screen = createSiteEditorScreen({
    apiClient: options.apiClient,
    createRetryBackoffMs: 0,
    documentRef: createFakeDocument(),
    mode: "edit",
    onCancel: vi.fn(),
    onImages: vi.fn(),
    onSaved: vi.fn(),
    onStatus: vi.fn(),
    pollIntervalMs: 0,
    role: "admin",
    siteId: SITE_ID,
    storage: options.storage,
    uuidFactory: options.uuidFactory ?? createUuidSequence([REQUEST_ID])
  });

  await screen.load();
  return screen;
}

function createEditorApi(options = {}) {
  return {
    requestJson: vi.fn((requestPath, requestOptions = {}) => {
      if (requestPath === CATEGORY_PATH) {
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      }
      if (requestPath === `/api/admin/sites/${SITE_ID}` && requestOptions.method === "GET") {
        return Promise.resolve({ data: siteFixture() });
      }
      if (requestPath === "/api/admin/public-catalog/status" && requestOptions.method === "GET") {
        return Promise.resolve({
          data: {
            showDemoInModal: true,
            status: { showDemoInModal: true }
          }
        });
      }
      if (typeof options.onRequest === "function") {
        return options.onRequest(requestPath, requestOptions);
      }
      throw new Error(`Unexpected request ${requestPath}`);
    }),
    requestMultipart: vi.fn((requestPath, requestOptions = {}) => {
      if (typeof options.onRequest === "function") {
        return options.onRequest(requestPath, requestOptions);
      }
      throw new Error(`Unexpected multipart request ${requestPath}`);
    })
  };
}

function createLifecycleApi(options = {}) {
  return {
    requestJson: vi.fn((requestPath, requestOptions = {}) => {
      if (requestPath === "/api/admin/categories?limit=100&page=1") {
        return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
      }
      if (typeof options.onRequest === "function") {
        return options.onRequest(requestPath, requestOptions);
      }
      throw new Error(`Unexpected request ${requestPath}`);
    })
  };
}

function canonicalCard(overrides = {}) {
  return {
    active: true,
    aliases: ["synthetic-site"],
    category: "Synthetic Category",
    deliveryTime: "от 3 дней",
    demoLocalUrl: null,
    demoMode: "external-iframe",
    demoUrl: "https://example.com/demo",
    description: "Synthetic short description",
    editableTitle: true,
    externalDemoUrl: "https://example.com/demo",
    features: ["Feature A"],
    filter: "synthetic-category",
    galleryImages: [
      "https://storage.example.test/gallery-a.webp",
      "https://storage.example.test/gallery-b.webp"
    ],
    id: "synthetic-site",
    legacyTitle: "Synthetic Site",
    originalDemoUrl: "https://example.com/demo",
    previewImage: "https://storage.example.test/preview.webp",
    previewType: "services",
    priceFrom: "от 100 000 ₽",
    siteUrl: "https://example.com/site",
    slug: "synthetic-site",
    sortOrder: 10,
    tags: ["synthetic"],
    title: "Synthetic Site",
    ...overrides
  };
}

function siteFixture(overrides = {}) {
  return {
    active: true,
    category: categoryFixture(),
    categoryId: CATEGORY_ID,
    deliveryLabel: "от 3 дней",
    demoLocalUrl: null,
    demoMode: "external-iframe",
    demoUrl: "https://example.com/demo",
    externalDemoUrl: "https://example.com/demo",
    features: ["Feature A"],
    galleryImages: [
      { url: "https://storage.example.test/gallery-a.webp" },
      { url: "https://storage.example.test/gallery-b.webp" }
    ],
    id: SITE_ID,
    legacyTitle: "Synthetic Site",
    originalDemoUrl: "https://example.com/demo",
    previewImageUrl: "https://storage.example.test/preview.webp",
    previewType: "services",
    priceLabel: "от 100 000 ₽",
    shortDescription: "Synthetic short description",
    siteUrl: "https://example.com/site",
    slug: "synthetic-site",
    sortOrder: 10,
    status: "published",
    tags: ["synthetic"],
    title: "Synthetic Site",
    updatedAt: "2026-08-05T11:00:00.000Z",
    ...overrides
  };
}

function categoryFixture() {
  return {
    id: CATEGORY_ID,
    slug: "synthetic-category",
    title: "Synthetic Category"
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
    action: "update",
    buttonLabel: "Проверяется",
    cardId: "synthetic-site",
    noOp: false,
    operationId: REQUEST_ID,
    prNumber: 42,
    requestId: REQUEST_ID,
    retryable: false,
    stableStatus: "Проверяется",
    status: "validating",
    statusUrl: STATUS_URL,
    ...overrides
  };
}

function createUuidSequence(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
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
    }),
    values: () => Array.from(values.values())
  };
}
