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
const OPERATION_URL = "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed";

describe("Direct Pages publication progress mapping", () => {
  it("renders save, upload, validate, publish and verified success copy inside the same primary control", async () => {
    const requests = [];
    const createDraft = createDeferred();
    const previewUpload = createDeferred();
    const verifySite = createDeferred();
    const publicationPost = createDeferred();
    const apiClient = createEditorApi((requestPath, options = {}) => {
      requests.push({ options, requestPath });
      if (requestPath === "/api/ready") {
        return Promise.resolve({ status: "ready" });
      }
      if (requestPath === "/api/admin/sites" && options.method === "POST") {
        return createDraft.promise;
      }
      if (requestPath === `/api/admin/sites/${SITE_ID}/images/preview` && options.method === "PUT") {
        return previewUpload.promise;
      }
      if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "GET") {
        return verifySite.promise;
      }
      if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
        return publicationPost.promise;
      }
      if (requestPath === OPERATION_URL) {
        return Promise.resolve({
          data: publicationDto({
            buttonLabel: "Опубликовано",
            stableStatus: "Опубликовано",
            status: "succeeded"
          })
        });
      }
      throw new Error(`Unexpected request ${requestPath}`);
    });
    const screen = await renderEditor({
      apiClient,
      mode: "create",
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-0000000000f1",
        "00000000-0000-4000-8000-0000000000f2",
        "00000000-0000-4000-8000-0000000000f3"
      ])
    });
    const primaryControl = () => screen.element.querySelector('[data-primary-publication-control="true"]');

    expect(primaryControl()).not.toBeNull();
    fillRequiredFields(screen.element);
    selectPreview(screen.element, imageFile("preview.png"));
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));

    await waitFor(() => primaryControl()?.textContent === "Сохраняем...");
    createDraft.resolve({ data: { id: SITE_ID, ...siteFixture({ id: SITE_ID }) } });
    await waitFor(() => primaryControl()?.textContent === "Загружаем изображения 1 из 1...");
    previewUpload.resolve({ data: { image: { assetId: "preview-asset" } } });
    await waitFor(() => primaryControl()?.textContent === "Проверяем...");
    verifySite.resolve({ data: siteFixture({ id: SITE_ID, status: "draft" }) });
    await waitFor(() => requests.some((request) => request.requestPath.endsWith("/publication")));
    expect(primaryControl().textContent).toBe("Публикуем...");
    publicationPost.resolve({
      data: publicationDto({
        buttonLabel: "Публикуется…",
        stableStatus: "Публикуется",
        status: "queued"
      })
    });
    await waitFor(() => primaryControl()?.textContent === "Опубликовано");

    expect(screen.element.querySelectorAll('[data-primary-publication-control="true"]')).toHaveLength(1);
    expect(screen.element.textContent).not.toMatch(
      /content_transaction|media_preflight|projection_page|chunk_upload|active_verify|db_finalize|revision|checksum|bucket|manifest|lease/i
    );
  });

  it.each([
    ["queued", "Публикуется…", "Публикуется", "Публикуется…"],
    ["running", "Публикуется…", "Публикуется", "Публикуется…"],
    ["retry_wait", "Публикуется…", "Публикуется", "Публикуется…"],
    ["failed", "Повторить публикацию", "Ошибка публикации", "Повторить публикацию"],
    ["succeeded", "Опубликовано", "Опубликовано", "Опубликовано"]
  ])("maps %s status to the approved button label without raw server internals", async (
    status,
    buttonLabel,
    stableStatus,
    expectedLabel
  ) => {
    const terminalStatus = status === "failed" || status === "succeeded";
    const statusResponse = createDeferred();
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({ data: publicationDto({ buttonLabel, retryable: status === "failed", stableStatus, status }) });
        }
        if (requestPath === OPERATION_URL) {
          return statusResponse.promise;
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    expect(screen.element.querySelector('[data-primary-publication-control="true"]')).not.toBeNull();
    setValue(screen.element, "title", `Status ${status}`);
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === expectedLabel);

    expect(screen.element.textContent).not.toMatch(/requestFingerprint|manifest|bucket|sha256|lockedBy|lease/i);
    if (!terminalStatus) {
      statusResponse.resolve({
        data: publicationDto({
          buttonLabel: "Опубликовано",
          stableStatus: "Опубликовано",
          status: "succeeded"
        })
      });
      await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Опубликовано");
    }
  });

  it("keeps the primary publication control busy until a delayed terminal success arrives", async () => {
    const statusResponse = createDeferred();
    const requests = [];
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Публикуется…",
              stableStatus: "Публикуется",
              status: "queued"
            })
          });
        }
        if (requestPath === OPERATION_URL) {
          return statusResponse.promise;
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    const primaryControl = screen.element.querySelector('[data-primary-publication-control="true"]');
    setValue(screen.element, "title", "Delayed terminal success");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));

    await waitFor(() => primaryControl.textContent === "Публикуется…");
    expect(primaryControl.disabled).toBe(true);
    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(1);

    statusResponse.resolve({
      data: publicationDto({
        buttonLabel: "Опубликовано",
        stableStatus: "Опубликовано",
        status: "succeeded"
      })
    });
    await waitFor(() => primaryControl.textContent === "Опубликовано" && primaryControl.disabled === false);
  });

  it("reconnects a remembered operation from safe metadata and clears it after verified success", async () => {
    const storage = createMemoryStorage();

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1
    }));

    const requests = [];
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === OPERATION_URL) {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              stableStatus: "Опубликовано",
              status: "succeeded"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      storage
    });

    expect(requests.map((request) => request.requestPath)).toEqual([OPERATION_URL]);
    expect(screen.element.querySelector('[data-primary-publication-control="true"]').textContent).toBe("Опубликовано");
    expect(storage.getItem("web00_admin_publication_reconnect_v1")).toBeNull();
    expect(JSON.stringify(storage.values())).not.toMatch(/idempotency|title|image|secret|cookie|password|checkpoint|catalog/i);
  });

  it("reconnects a nonterminal remembered operation as a busy guarded publication", async () => {
    const storage = createMemoryStorage();
    const requests = [];

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1
    }));

    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === OPERATION_URL) {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Публикуется…",
              stableStatus: "Публикуется",
              status: "queued"
            })
          });
        }
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      storage
    });
    const primaryControl = screen.element.querySelector('[data-primary-publication-control="true"]');

    expect(primaryControl.textContent).toBe("Публикуется…");
    expect(primaryControl.disabled).toBe(true);

    setValue(screen.element, "title", "Blocked by reconnect");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));

    expect(requests.filter((request) => request.requestPath.endsWith("/publication"))).toHaveLength(0);
  });

  it("rejects reconnect status responses for a different operation id", async () => {
    const storage = createMemoryStorage();

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1
    }));

    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath) => {
        if (requestPath === OPERATION_URL) {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              operationId: "00000000-0000-4000-8000-00000000beef",
              stableStatus: "Опубликовано",
              status: "succeeded",
              statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000beef"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      storage
    });

    expect(screen.element.querySelector('[data-primary-publication-control="true"]').textContent).toBe("Опубликовать");
    expect(screen.element.textContent).not.toContain("Опубликовано");
    expect(storage.getItem("web00_admin_publication_reconnect_v1")).toBeNull();
  });

  it("persists safe Direct Pages reconnect metadata without secrets", async () => {
    const storage = createMemoryStorage();
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Публикуется…",
              stableStatus: "Публикуется",
              status: "queued"
            })
          });
        }
        if (requestPath === OPERATION_URL) {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              stableStatus: "Опубликовано",
              status: "succeeded"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      storage,
      uuidFactory: createUuidSequence(["00000000-0000-4000-8000-0000000000ab"])
    });

    setValue(screen.element, "title", "Safe reconnect metadata");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => storage.setItem.mock.calls.length === 1);

    const [, rawMetadata] = storage.setItem.mock.calls[0];
    expect(JSON.parse(rawMetadata)).toEqual({
      operationId: "00000000-0000-4000-8000-00000000feed",
      prNumber: null,
      requestId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: expect.any(String),
      version: 2
    });
    expect(rawMetadata).not.toMatch(/WEB00_GITHUB_TOKEN|github_pat|ghp_|Authorization|Bearer/i);
  });

  it("fails closed on unknown operation DTOs without rendering raw labels or false published state", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: {
              buttonLabel: "<img src=x onerror=alert(1)>",
              operationId: "00000000-0000-4000-8000-00000000feed",
              retryable: false,
              stableStatus: "Опубликовано",
              status: "telemetry",
              statusUrl: OPERATION_URL
            }
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    expect(screen.element.querySelector('[data-primary-publication-control="true"]')).not.toBeNull();
    setValue(screen.element, "title", "Unknown dto");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Повторить публикацию");

    expect(screen.element.textContent).not.toContain("<img");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });

  it("fails closed when a publication DTO mixes status with another status label", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              retryable: false,
              stableStatus: "Опубликовано",
              status: "queued"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    setValue(screen.element, "title", "Mixed tuple");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Повторить публикацию");

    expect(screen.element.textContent).toContain("Сервер вернул некорректный ответ публикации.");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });

  it("fails closed when publish receives a terminal success DTO for a not-published operation", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовать",
              retryable: false,
              stableStatus: "Не опубликовано",
              status: "published"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    setValue(screen.element, "title", "Wrong terminal publish tuple");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Повторить публикацию");

    expect(screen.element.textContent).toContain("Сервер вернул некорректный ответ публикации.");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });

  it("does not reconnect a remembered publication on an editor-only screen", async () => {
    const storage = createMemoryStorage();
    const requests = [];

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1
    }));

    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === OPERATION_URL) {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Публикуется…",
              stableStatus: "Публикуется",
              status: "queued"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      role: "editor",
      storage
    });

    expect(requests.filter((request) => request.requestPath === OPERATION_URL)).toHaveLength(0);
    expect(screen.element.querySelector('[data-primary-publication-control="true"]')).toBeNull();
    expect(screen.element.querySelector('[data-action="save-site"]').textContent).toBe("Сохранить");
    expect(storage.getItem("web00_admin_publication_reconnect_v1")).not.toBeNull();
  });

  it("keeps a remembered operation and fail-closes the editor on transient reconnect status failure", async () => {
    const storage = createMemoryStorage();

    storage.setItem("web00_admin_publication_reconnect_v1", JSON.stringify({
      operationId: "00000000-0000-4000-8000-00000000feed",
      siteId: SITE_ID,
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1
    }));

    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath) => {
        if (requestPath === OPERATION_URL) {
          return Promise.reject({
            code: "REQUEST_TIMEOUT",
            message: "Operation status timeout.",
            requestId: "req_operation_status_timeout",
            status: 0
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      storage
    });
    const primaryControl = screen.element.querySelector('[data-primary-publication-control="true"]');

    expect(storage.getItem("web00_admin_publication_reconnect_v1")).not.toBeNull();
    expect(primaryControl.textContent).toBe("Публикуется…");
    expect(primaryControl.disabled).toBe(true);
    expect(screen.element.textContent).not.toContain("Форма готова.");
  });

  it("reuses the same publication idempotency key after an uncertain POST response", async () => {
    const requests = [];
    let attempts = 0;
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          attempts += 1;
          if (attempts === 1) {
            return Promise.reject({
              code: "NETWORK_ERROR",
              message: "Response lost.",
              requestId: "req_publication_lost_response",
              status: 0
            });
          }
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              stableStatus: "Опубликовано",
              status: "succeeded"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      }),
      uuidFactory: createUuidSequence([
        "00000000-0000-4000-8000-0000000000ab",
        "00000000-0000-4000-8000-0000000000cd"
      ])
    });

    setValue(screen.element, "title", "Uncertain POST");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Повторить публикацию");

    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Опубликовано");

    expect(requests
      .filter((request) => request.requestPath.endsWith("/publication"))
      .map((request) => request.options.headers["Idempotency-Key"])).toEqual([
      "00000000-0000-4000-8000-0000000000ab",
      "00000000-0000-4000-8000-0000000000ab"
    ]);
  });

  it("fails closed when operation statusUrl does not match the operation id", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Опубликовано",
              stableStatus: "Опубликовано",
              status: "succeeded",
              statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000badd"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    setValue(screen.element, "title", "Wrong status url");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector('[data-primary-publication-control="true"]').textContent === "Повторить публикацию");

    expect(screen.element.textContent).toContain("Сервер вернул некорректный ответ публикации.");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });

  it("renders terminal failure as retryable publication state without false success", async () => {
    const screen = await renderEditor({
      apiClient: createEditorApi((requestPath, options = {}) => {
        if (requestPath === "/api/ready") {
          return Promise.resolve({ status: "ready" });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}` && options.method === "PATCH") {
          return Promise.resolve({ data: siteFixture({ title: options.body.title }) });
        }
        if (requestPath === `/api/admin/sites/${SITE_ID}/publication` && options.method === "POST") {
          return Promise.resolve({
            data: publicationDto({
              buttonLabel: "Повторить публикацию",
              retryable: true,
              stableStatus: "Ошибка публикации",
              status: "failed"
            })
          });
        }
        throw new Error(`Unexpected request ${requestPath}`);
      })
    });

    setValue(screen.element, "title", "Terminal publication failure");
    screen.element.querySelector("form").dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.querySelector("form").getAttribute("data-save-state") === "publicationFailed");

    expect(screen.element.querySelector('[data-primary-publication-control="true"]').textContent).toBe("Повторить публикацию");
    expect(screen.element.textContent).toContain("Ошибка публикации");
    expect(screen.element.textContent).not.toContain("Опубликовано");
  });
});

async function renderEditor(options = {}) {
  const documentRef = createFakeDocument();
  const screen = createSiteEditorScreen({
    apiClient: options.apiClient,
    createRetryBackoffMs: 0,
    documentRef,
    mode: options.mode ?? "edit",
    onCancel: vi.fn(),
    onImages: vi.fn(),
    onSaved: vi.fn(),
    onStatus: vi.fn(),
    pollIntervalMs: 0,
    role: options.role ?? "admin",
    siteId: options.siteId ?? SITE_ID,
    storage: options.storage,
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
        return Promise.resolve({
          data: {
            showDemoInModal: true,
            status: {
              showDemoInModal: true
            }
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages/card/synthetic-site" && options.method === "GET") {
        return Promise.resolve({
          data: {
            blobSha: "sha-synthetic-site",
            card: null,
            cardId: "synthetic-site"
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages" && options.method === "POST") {
        return onRequest(`/api/admin/sites/${SITE_ID}/publication`, {
          ...options,
          body: { action: "publish" },
          headers: {
            ...(options.headers ?? {}),
            "Idempotency-Key": options.body?.requestId
          }
        });
      }
      if (requestPath === "/api/admin/publication/pages/00000000-0000-4000-8000-00000000feed") {
        return onRequest(OPERATION_URL, options);
      }
      return onRequest(requestPath, options);
    }),
    requestMultipart: vi.fn((requestPath, options = {}) => onRequest(requestPath, options))
  };
}

function fillRequiredFields(root) {
  setValue(root, "title", "Synthetic Site");
  setValue(root, "slug", "synthetic-site");
  setValue(root, "categoryId", CATEGORY_ID);
  setValue(root, "shortDescription", "Synthetic short description");
}

function selectPreview(root, file) {
  const input = root.querySelector('[name="previewImage"]');
  input.files = [file];
  input.dispatchEvent(fakeEvent("change"));
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
    statusUrl: OPERATION_URL,
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
