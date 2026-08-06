import { describe, expect, it, vi } from "vitest";

import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";
import {
  createDeferred,
  createFakeDocument,
  fakeEvent,
  setValue,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const SITE_ID = "00000000-0000-4000-8000-000000000101";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";

describe("Direct Pages admin one-button publication control", () => {
  it("ordinary site editor exposes one primary publication control and no save-only publication actions", async () => {
    for (const status of ["draft", "published", "needs_republish", "running", "failed", "unpublished_restorable"]) {
      const screen = await renderEditor({
        apiClient: createEditorApi({ site: siteFixture({ status }) }),
        mode: "edit",
        role: "admin"
      });

      const primaryControls = screen.element.querySelectorAll('[data-primary-publication-control="true"]');
      expect(primaryControls, status).toHaveLength(1);
      expect(primaryControls[0].tagName).toBe("button");
      expect(primaryControls[0].textContent).toMatch(
        /Опубликовать|Сохраняем|Загружаем изображения|Проверяем|Публикуем|Опубликовано|Повторить публикацию/
      );

      for (const forbiddenAction of [
        "publish-site-lifecycle-only",
        "unpublish-site-lifecycle-only",
        "sync-public-catalog",
        "public-catalog-dry-run",
        "refresh-public-catalog-status",
        "apply-public-catalog",
        "save-public-catalog-settings",
        "bootstrap-public-catalog-bucket",
        "repair-public-catalog-snapshot"
      ]) {
        expect(screen.element.querySelectorAll(`[data-action="${forbiddenAction}"]`), forbiddenAction).toHaveLength(0);
      }

      const visibleRoutinePublicationButtons = screen.element
        .querySelectorAll("button")
        .filter((button) =>
          /Сохранить|Загрузить|Dry-run|Sync|Apply|Refresh|Обновить статус|Синхронизировать/.test(button.textContent) &&
          !hasAncestorAttribute(button, "data-overflow-menu", "true")
        );
      expect(visibleRoutinePublicationButtons, status).toEqual([]);
      expect(screen.element.textContent).not.toMatch(/revision|checksum|bucket|manifest|lease|Storage path/i);
    }
  });

  it("one click creates a draft, uploads selected media, starts publication, polls to verified success and blocks duplicate submit", async () => {
    const requests = [];
    const publicationAccepted = createDeferred();
    const onSaved = vi.fn();
    const apiClient = createEditorApi({
      onRequest(requestPath, options = {}) {
        requests.push({ options, requestPath });
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites" && options.method === "POST") {
          return Promise.resolve({ data: { id: SITE_ID, ...options.body } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/images/preview` && options.method === "PUT") {
          return Promise.resolve({ data: { image: { assetId: "preview-asset" } } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/images/gallery` && options.method === "POST") {
          return Promise.resolve({ data: { image: { assetId: `gallery-${galleryUploads(requests)}` } } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
          return Promise.resolve({ data: siteFixture({ id: SITE_ID, status: "draft" }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return publicationAccepted.promise;
        }
        if (requestPath === "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              status: "succeeded",
              stableStatus: "Опубликовано"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }
    });
    const screen = await renderEditor({
      apiClient,
      mode: "create",
      onSaved,
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-0000000000c1",
        "00000000-0000-4000-8000-0000000000c2",
        "00000000-0000-4000-8000-0000000000c3",
        "00000000-0000-4000-8000-0000000000c4"
      ])
    });

    fillRequiredFields(screen.element);
    selectImages(screen.element, {
      gallery: [imageFile("gallery-a.png"), imageFile("gallery-b.png")],
      preview: imageFile("preview.png")
    });

    const form = screen.element.querySelector("form");
    form.dispatchEvent(fakeEvent("submit"));
    form.dispatchEvent(fakeEvent("submit"));

    await waitFor(() => onSaved.mock.calls.length === 1);
    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(1);
    const primaryControl = screen.element.querySelector('[data-primary-publication-control="true"]');
    expect(primaryControl.disabled).toBe(true);
    expect(primaryControl.textContent).toMatch(/Публикуем|Загружаем изображения|Проверяем|Сохраняем/);

    publicationAccepted.resolve({
      data: publicationDto({
        buttonLabel: "Публикуется…",
        status: "queued",
        stableStatus: "Публикуется"
      })
    });
    await waitFor(() => primaryControl.textContent === "Опубликовано");

    expect(requests.map((request) => request.requestPath)).toEqual([
      "/api/ready",
      "/api/admin/sites",
      `/api/admin/sites/${SITE_ID}/images/preview`,
      `/api/admin/sites/${SITE_ID}/images/gallery`,
      `/api/admin/sites/${SITE_ID}/images/gallery`,
      `/api/admin/sites/${SITE_ID}/publication`,
      "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    ]);
    const publicationRequest = requests.find((request) => request.requestPath.endsWith("/publication"));
    expect(publicationRequest.options.body).toEqual({ action: "publish" });
    expect(publicationRequest.options.headers).toMatchObject({
      "Idempotency-Key": "00000000-0000-4000-8000-0000000000c4"
    });
    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: SITE_ID }));
  });

  it("keeps form values and selected filenames visible when publication fails", async () => {
    const requests = [];
    let publicationAttempts = 0;
    const apiClient = createEditorApi({
      onRequest(requestPath, options = {}) {
        requests.push({ options, requestPath });
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites" && options.method === "POST") {
          return Promise.resolve({ data: { id: SITE_ID, ...options.body } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/images/preview` && options.method === "PUT") {
          return Promise.resolve({ data: { image: { assetId: "preview-asset" } } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/images/gallery` && options.method === "POST") {
          return Promise.resolve({ data: { image: { assetId: "gallery-asset" } } });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
          return Promise.resolve({ data: siteFixture({ id: SITE_ID, status: "draft" }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          publicationAttempts += 1;
          if (publicationAttempts === 2) {
            return Promise.resolve({
              data: publicationDto({
                buttonLabel: "Опубликовано",
                stableStatus: "Опубликовано",
                status: "succeeded"
              })
            });
          }
          return Promise.reject({
            code: "PUBLIC_CATALOG_SYNC_CONFLICT",
            message: "Another publication is running.",
            requestId: "req_publication_conflict",
            status: 409
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }
    });
    const onSaved = vi.fn();
    const screen = await renderEditor({
      apiClient,
      mode: "create",
      onSaved,
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-0000000000d1",
        "00000000-0000-4000-8000-0000000000d2"
      ])
    });

    fillRequiredFields(screen.element, { title: "Publication failure" });
    selectImages(screen.element, {
      gallery: [imageFile("gallery-still-selected.png")],
      preview: imageFile("preview-still-selected.png")
    });
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));

    await waitFor(() => onSaved.mock.calls.length === 1);
    expect(apiClient.requestJson.mock.calls.filter(([requestPath]) => requestPath === "/api/admin/publication/pages")).toHaveLength(1);

    expect(screen.element.querySelector('[name="title"]').value).toBe("Publication failure");
    expect(screen.element.textContent).toContain("preview-still-selected.png");
    expect(screen.element.textContent).toContain("gallery-still-selected.png");
    expect(screen.element.querySelector('[data-primary-publication-control="true"]').textContent).toBe("Повторить публикацию");
    expect(screen.element.querySelector("form")).not.toBeNull();

    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Опубликовано");

    expect(requests.filter((request) => request.requestPath === "/api/admin/sites")).toHaveLength(1);
    expect(requests.filter((request) => request.requestPath.endsWith("/images/preview"))).toHaveLength(1);
    expect(requests.filter((request) => request.requestPath.endsWith("/images/gallery"))).toHaveLength(1);
    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(2);
  });

  it("preserves editor save-only lifecycle without admin publication or demo setting mutations", async () => {
    const requests = [];
    const onSaved = vi.fn();
    const apiClient = createEditorApi({
      onRequest(requestPath, options = {}) {
        requests.push({ options, requestPath });
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === "/api/admin/sites" && options.method === "POST") {
          return Promise.resolve({ data: { id: SITE_ID, ...options.body } });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }
    });
    const screen = await renderEditor({
      apiClient,
      mode: "create",
      onSaved,
      role: "editor"
    });

    expect(screen.element.querySelectorAll('[data-primary-publication-control="true"]')).toHaveLength(0);
    expect(screen.element.querySelector('[role="switch"]')).toBeNull();
    expect(screen.element.querySelector('[data-action="save-site"]').textContent).toBe("Сохранить");

    fillRequiredFields(screen.element);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => onSaved.mock.calls.length === 1);

    expect(requests.map((request) => request.requestPath)).toEqual([
      "/api/ready",
      "/api/admin/sites"
    ]);
    expect(requests.some((request) => request.requestPath.endsWith("/publication"))).toBe(false);
    expect(requests.some((request) => request.requestPath === "/api/admin/public-catalog/settings")).toBe(false);
  });

  it("keeps editor save-only errors free of publication retry copy", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi(),
      mode: "create",
      role: "editor"
    });

    expect(screen.element.querySelector('[data-action="save-site"]').textContent).toBe("Сохранить");

    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.element.querySelector('[data-primary-publication-control="true"]')).toBeNull();
    expect(screen.element.querySelector('[data-action="save-site"]').textContent).toBe("Сохранить");
    expect(screen.element.textContent).not.toContain("Повторить публикацию");
  });
});

async function renderEditor(options = {}) {
  const documentRef = options.documentRef ?? createFakeDocument();
  const screen = createSiteEditorScreen({
    apiClient: options.apiClient,
    createRetryBackoffMs: 0,
    documentRef,
    mode: options.mode ?? "edit",
    onCancel: vi.fn(),
    onImages: vi.fn(),
    onSaved: options.onSaved ?? vi.fn(),
    onStatus: vi.fn(),
    pollIntervalMs: 0,
    role: options.role ?? "admin",
    siteId: options.siteId ?? SITE_ID,
    uuidFactory: options.uuidFactory ?? createUuidSequence(["00000000-0000-4000-8000-000000000099"])
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
        return Promise.resolve({ data: options.site ?? siteFixture() });
      }
      if (requestPath === "/api/admin/public-catalog/status" && requestOptions.method === "GET") {
        return Promise.resolve({
          data: {
            showDemoInModal: true,
            status: {
              showDemoInModal: true
            }
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && requestOptions.method === "GET") {
        return Promise.resolve({
          data: {
            blobSha: requestOptions.mode === "create" ? null : "sha-synthetic-site",
            card: null,
            cardId: "synthetic-site"
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages" && requestOptions.method === "POST") {
        return options.onRequest?.(`/api/admin/sites/${SITE_ID}/publication`, {
          ...requestOptions,
          body: { action: "publish" },
          headers: {
            ...(requestOptions.headers ?? {}),
            "Idempotency-Key": requestOptions.body?.requestId
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages/00000000-0000-4000-8000-00000000feed") {
        return options.onRequest?.("/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed", requestOptions);
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

function fillRequiredFields(root, options = {}) {
  setValue(root, "title", options.title ?? "Synthetic Site");
  setValue(root, "slug", options.slug ?? "synthetic-site");
  setValue(root, "categoryId", CATEGORY_ID);
  setValue(root, "shortDescription", options.shortDescription ?? "Synthetic short description");
}

function selectImages(root, options) {
  const preview = root.querySelector('[name="previewImage"]');
  const gallery = root.querySelector('[name="galleryBatchImages"]');
  if (preview !== null && options.preview !== undefined) {
    preview.files = [options.preview];
    preview.dispatchEvent(fakeEvent("change"));
  }
  if (gallery !== null && options.gallery !== undefined) {
    gallery.files = options.gallery;
    gallery.dispatchEvent(fakeEvent("change"));
  }
}

function imageFile(name, type = "image/png", size = 128) {
  return new File([new Uint8Array(size)], name, { type });
}

function categoryFixture() {
  return {
    id: CATEGORY_ID,
    slug: "synthetic-category",
    title: "Synthetic Category"
  };
}

function siteFixture(overrides = {}) {
  return {
    active: true,
    categoryId: CATEGORY_ID,
    deletedAt: null,
    deliveryLabel: "от 3 дней",
    features: ["Feature A"],
    galleryImages: [{ url: "https://storage.example.test/gallery.webp" }],
    id: SITE_ID,
    previewImageUrl: "https://storage.example.test/preview.webp",
    priceLabel: "от 100 000 ₽",
    shortDescription: "Synthetic short description",
    slug: "synthetic-site",
    status: "draft",
    title: "Synthetic Site",
    ...overrides
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

function galleryUploads(requests) {
  return requests.filter((request) => request.requestPath.endsWith("/images/gallery")).length + 1;
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
