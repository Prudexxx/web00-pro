import { describe, expect, it, vi } from "vitest";

import {
  IMAGE_UPLOAD_LIMITS,
  canManageImages,
  createImageManagerScreen
} from "../src/admin/assets/screens/image-manager.js";

describe("admin image manager screen", () => {
  it("loads current preview/gallery safely and gates mutation UI by role and site state", async () => {
    const documentRef = createFakeDocument();
    const screen = createImageManagerScreen({
      apiClient: createImageApi(siteFixture({
        previewImageUrl: 'javascript:alert("x")'
      })),
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();

    expect(screen.element.textContent).toContain("CRM Site");
    expect(screen.element.querySelector("img")).toBeNull();
    expect(screen.element.querySelector('[data-action="replace-preview"]')).not.toBeNull();
    expect(canManageImages(siteFixture({ status: "draft" }), "editor")).toBe(true);
    expect(canManageImages(siteFixture({ status: "published" }), "editor")).toBe(false);
    expect(canManageImages(siteFixture({ status: "published" }), "admin")).toBe(true);
    expect(canManageImages(siteFixture({ active: false, status: "draft" }), "admin")).toBe(false);
    expect(canManageImages(siteFixture({ deletedAt: "2026-07-28T00:00:00.000Z" }), "admin")).toBe(false);
    expect(canManageImages(siteFixture({ status: "archived" }), "admin")).toBe(false);
  });

  it("uploads preview with exact multipart fields, no manual Content-Type, no replay, and a new UUID per explicit retry", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath) => {
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101") {
          return Promise.resolve({ data: siteFixture() });
        }
        throw new Error(`Unexpected JSON path ${requestPath}`);
      }),
      requestMultipart: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requests.length === 1) {
          return Promise.reject({ message: "Upload failed.", requestId: "req_preview" });
        }
        return Promise.resolve({
          data: {
            previewImage: {
              assetId: "00000000-0000-4000-8000-000000000201",
              url: "https://storage.example.test/preview-new.webp",
              variants: []
            },
            replaced: false,
            replayed: false
          }
        });
      })
    };
    const screen = createImageManagerScreen({
      apiClient,
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101",
      uuidFactory: makeUuidFactory("00000000-0000-4000-8000-000000000301", "00000000-0000-4000-8000-000000000302")
    });

    await screen.load();
    setFiles(screen.element, "previewImage", [imageFile("preview.jpg", "image/jpeg", 12)]);
    setValue(screen.element, "previewAlt", " Preview alt ");
    screen.element.querySelector('[data-action="replace-preview"]').dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Upload failed."));

    expect(requests).toHaveLength(1);
    expect(requests[0].requestPath).toBe("/api/admin/sites/00000000-0000-4000-8000-000000000101/images/preview");
    expect(requests[0].options.method).toBe("PUT");
    expect(requests[0].options.headers).toBeUndefined();
    expect(requests[0].options.body.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000301");
    expect(requests[0].options.body.get("alt")).toBe("Preview alt");
    expect(requests[0].options.body.get("image").name).toBe("preview.jpg");
    expect(screen.element.textContent).toContain("preview.jpg");

    screen.element.querySelector('[data-action="replace-preview"]').dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("preview-new.webp"));

    expect(requests).toHaveLength(2);
    expect(requests[1].options.body.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000302");
  });

  it("validates preview file type, size, and alt length before upload", async () => {
    const documentRef = createFakeDocument();
    const apiClient = createImageApi(siteFixture());
    const screen = createImageManagerScreen({
      apiClient,
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    setFiles(screen.element, "previewImage", [imageFile("bad.gif", "image/gif", 12)]);
    screen.element.querySelector('[data-action="replace-preview"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("JPEG, PNG, WEBP или AVIF");

    setFiles(screen.element, "previewImage", [imageFile("large.png", "image/png", IMAGE_UPLOAD_LIMITS.fileBytes + 1)]);
    screen.element.querySelector('[data-action="replace-preview"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("5 MB");

    setFiles(screen.element, "previewImage", [imageFile("ok.avif", "image/avif", 12)]);
    setValue(screen.element, "previewAlt", "x".repeat(161));
    screen.element.querySelector('[data-action="replace-preview"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("160");
    expect(apiClient.requestMultipart).not.toHaveBeenCalled();
  });

  it("deletes preview through confirmation and refreshes site state", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "GET") {
          return Promise.resolve({ data: siteFixture() });
        }
        if (requestPath.endsWith("/images/preview")) {
          return Promise.resolve({ data: { previewImage: null, replaced: true, replayed: false } });
        }
        throw new Error(`Unexpected JSON path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
    };
    const screen = createImageManagerScreen({
      apiClient,
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    screen.element.querySelector('[data-action="delete-preview"]').dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => requests.some((request) => request.options.method === "DELETE"));

    const deletion = requests.find((request) => request.options.method === "DELETE");
    expect(deletion.requestPath).toBe("/api/admin/sites/00000000-0000-4000-8000-000000000101/images/preview");
  });

  it("uploads gallery single and batch with exact fields, limits, and truthful partial results", async () => {
    const documentRef = createFakeDocument();
    const multipart = [];
    const screen = createImageManagerScreen({
      apiClient: {
        requestJson: vi.fn((requestPath) => {
          if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101") {
            return Promise.resolve({ data: siteFixture({ galleryImages: [galleryFixture()] }) });
          }
          throw new Error(`Unexpected JSON path ${requestPath}`);
        }),
        requestMultipart: vi.fn((requestPath, options = {}) => {
          multipart.push({ options, requestPath });
          if (requestPath.endsWith("/gallery/batch")) {
            return Promise.resolve({
              data: {
                failed: [{ clientFileId: "00000000-0000-4000-8000-000000000402", code: "IMAGE_TOO_LARGE", index: 1, message: "Too large." }],
                succeeded: [{ clientFileId: "00000000-0000-4000-8000-000000000401", image: galleryFixture({ assetId: "00000000-0000-4000-8000-000000000401" }), index: 0, replayed: false }]
              }
            });
          }
          return Promise.resolve({
            data: {
              image: galleryFixture({ assetId: "00000000-0000-4000-8000-000000000400" }),
              replayed: false
            }
          });
        })
      },
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101",
      uuidFactory: makeUuidFactory(
        "00000000-0000-4000-8000-000000000400",
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402"
      )
    });

    await screen.load();
    setFiles(screen.element, "galleryImage", [imageFile("single.webp", "image/webp", 12)]);
    setValue(screen.element, "galleryAlt", "Single alt");
    screen.element.querySelector('[data-action="add-gallery-single"]').dispatchEvent(fakeEvent("submit"));
    await waitFor(() => multipart.length === 1);

    expect(multipart[0].requestPath).toBe("/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery");
    expect(multipart[0].options.headers).toBeUndefined();
    expect(multipart[0].options.body.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000400");
    expect(multipart[0].options.body.get("alt")).toBe("Single alt");
    expect(multipart[0].options.body.get("image").name).toBe("single.webp");

    setFiles(screen.element, "galleryBatchImages", [
      imageFile("first.png", "image/png", 12),
      imageFile("second.avif", "image/avif", 12)
    ]);
    setValue(screen.element, "galleryBatchAlt", "Batch alt");
    screen.element.querySelector('[data-action="add-gallery-batch"]').dispatchEvent(fakeEvent("submit"));
    await waitFor(() => multipart.length === 2);

    const entries = Array.from(multipart[1].options.body.entries());
    expect(multipart[1].requestPath).toBe("/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery/batch");
    expect(entries[0][0]).toBe("metadata");
    expect(JSON.parse(entries[0][1])).toEqual([
      { alt: "Batch alt", clientFileId: "00000000-0000-4000-8000-000000000401" },
      { alt: "Batch alt", clientFileId: "00000000-0000-4000-8000-000000000402" }
    ]);
    expect(entries.filter(([name]) => name === "images").map(([, file]) => file.name)).toEqual([
      "first.png",
      "second.avif"
    ]);
    expect(screen.element.textContent).toContain("Частично загружено");
    expect(screen.element.textContent).toContain("Too large.");
  });

  it("validates batch counts, total bytes, gallery maximum, and alt length before upload", async () => {
    const documentRef = createFakeDocument();
    const apiClient = createImageApi(siteFixture({
      galleryImages: Array.from({ length: 19 }, (_, index) => galleryFixture({
        assetId: uuidFromIndex(index + 1),
        sortOrder: index
      }))
    }));
    const screen = createImageManagerScreen({
      apiClient,
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    setFiles(screen.element, "galleryBatchImages", [
      imageFile("a.png", "image/png", 12),
      imageFile("b.png", "image/png", 12)
    ]);
    screen.element.querySelector('[data-action="add-gallery-batch"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("20");

    await screen.load();
    setFiles(screen.element, "galleryBatchImages", Array.from({ length: 11 }, (_, index) => imageFile(`${index}.png`, "image/png", 12)));
    screen.element.querySelector('[data-action="add-gallery-batch"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("10");

    setFiles(screen.element, "galleryBatchImages", Array.from({ length: 7 }, (_, index) => (
      imageFile(`large-${index}.png`, "image/png", IMAGE_UPLOAD_LIMITS.fileBytes)
    )));
    screen.element.querySelector('[data-action="add-gallery-batch"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("30 MB");

    setFiles(screen.element, "galleryImage", [imageFile("ok.png", "image/png", 12)]);
    setValue(screen.element, "galleryAlt", "x".repeat(161));
    screen.element.querySelector('[data-action="add-gallery-single"]').dispatchEvent(fakeEvent("submit"));
    expect(screen.element.textContent).toContain("160");
    expect(apiClient.requestMultipart).not.toHaveBeenCalled();
  });

  it("keeps selected gallery files visible when the batch response envelope is malformed", async () => {
    const documentRef = createFakeDocument();
    const onStatus = vi.fn();
    const screen = createImageManagerScreen({
      apiClient: {
        requestJson: vi.fn((requestPath) => {
          if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101") {
            return Promise.resolve({ data: siteFixture() });
          }
          throw new Error(`Unexpected JSON path ${requestPath}`);
        }),
        requestMultipart: vi.fn(() => Promise.resolve({ data: {} }))
      },
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus,
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101",
      uuidFactory: makeUuidFactory(
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402"
      )
    });

    await screen.load();
    setFiles(screen.element, "galleryBatchImages", [
      imageFile("first.png", "image/png", 12),
      imageFile("second.png", "image/png", 12)
    ]);
    screen.element.querySelector('[data-action="add-gallery-batch"]').dispatchEvent(fakeEvent("submit"));
    await waitFor(() => screen.element.textContent.includes("Сервер вернул некорректный ответ."));

    expect(screen.element.textContent).toContain("first.png, second.png");
    expect(screen.element.textContent).not.toContain("Batch загружен: 0 успешно.");
    expect(onStatus).toHaveBeenLastCalledWith("Сервер вернул некорректный ответ.");
  });

  it("reorders gallery with schema-exact payload, blocks duplicates, and deletes validated assets through confirmation", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" && options.method === "GET") {
          return Promise.resolve({ data: siteFixture({ galleryImages: [galleryFixture()] }) });
        }
        if (requestPath.endsWith("/images/gallery") && options.method === "PATCH") {
          return deferred.promise.then(() => ({ data: { images: [galleryFixture({ alt: "Updated", sortOrder: 3 })] } }));
        }
        if (requestPath.includes("/images/gallery/") && options.method === "DELETE") {
          return Promise.resolve({ data: { images: [] } });
        }
        throw new Error(`Unexpected JSON path ${requestPath}`);
      }),
      requestMultipart: vi.fn()
    };
    const screen = createImageManagerScreen({
      apiClient,
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    setValue(screen.element, "gallerySortOrder", "3");
    setValue(screen.element, "galleryItemAlt", "Updated");
    screen.element.querySelector('[data-action="reorder-gallery"]').dispatchEvent(fakeEvent("submit"));
    screen.element.querySelector('[data-action="reorder-gallery"]').dispatchEvent(fakeEvent("submit"));

    expect(requests.filter((request) => request.options.method === "PATCH")).toHaveLength(1);
    expect(requests.find((request) => request.options.method === "PATCH").options.body).toEqual({
      items: [{ alt: "Updated", assetId: "00000000-0000-4000-8000-000000000201", sortOrder: 3 }]
    });
    expect(JSON.stringify(requests.find((request) => request.options.method === "PATCH").options.body)).not.toMatch(/url|storagePath|variants/);

    deferred.resolve();
    await flushPromises();

    screen.element.querySelector('[data-action="delete-gallery-image"]').dispatchEvent(fakeEvent("click"));
    screen.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await waitFor(() => requests.some((request) => request.options.method === "DELETE"));

    expect(requests.find((request) => request.options.method === "DELETE").requestPath).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery/00000000-0000-4000-8000-000000000201"
    );
  });

  it("clears file inputs on destroy without object URL or persistent file storage", async () => {
    const documentRef = createFakeDocument();
    const screen = createImageManagerScreen({
      apiClient: createImageApi(siteFixture()),
      documentRef,
      onBack: vi.fn(),
      onSiteUpdated: vi.fn(),
      onStatus: vi.fn(),
      role: "editor",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();
    setFiles(screen.element, "previewImage", [imageFile("preview.png", "image/png", 12)]);
    setFiles(screen.element, "galleryBatchImages", [imageFile("gallery.png", "image/png", 12)]);
    screen.destroy();

    expect(screen.element.querySelector('[name="previewImage"]').files).toEqual([]);
    expect(screen.element.querySelector('[name="galleryBatchImages"]').files).toEqual([]);
  });
});

function createImageApi(site) {
  return {
    requestJson: vi.fn((requestPath) => {
      if (requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101") {
        return Promise.resolve({ data: site });
      }
      return Promise.resolve({ data: { previewImage: null, images: [] } });
    }),
    requestMultipart: vi.fn()
  };
}

function siteFixture(overrides = {}) {
  return {
    active: true,
    deletedAt: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    previewImageUrl: "https://storage.example.test/preview.webp",
    slug: "crm-site",
    status: "draft",
    title: "CRM Site",
    ...overrides
  };
}

function galleryFixture(overrides = {}) {
  return {
    alt: "Gallery alt",
    assetId: "00000000-0000-4000-8000-000000000201",
    sortOrder: 0,
    storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/00000000-0000-4000-8000-000000000201",
    url: "https://storage.example.test/gallery.webp",
    variants: [],
    ...overrides
  };
}

function uuidFromIndex(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function imageFile(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}

function setValue(root, name, value) {
  const field = root.querySelector(`[name="${name}"]`);
  field.value = value;
  field.dispatchEvent(fakeEvent("input"));
}

function setFiles(root, name, files) {
  const field = root.querySelector(`[name="${name}"]`);
  field.files = files;
  field.dispatchEvent(fakeEvent("change"));
}

function makeUuidFactory(...values) {
  let index = 0;

  return () => values[index++] ?? uuidFromIndex(index + 100);
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
  throw new Error("Timed out waiting for image manager work.");
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
