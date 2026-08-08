(function () {
  "use strict";

  const APPROVED_ORIGIN = "https://web00-public-runtime.s3-website.cloud.ru";
  const MANIFEST_URL = `${APPROVED_ORIGIN}/runtime/production/catalog/v1/manifest.json`;
  const PRODUCTION_PREFIX = "runtime/production/catalog/v1";
  const SCHEMA_VERSION = 1;

  function runtimeError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function isNonNegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isSha256(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  function assertIsoDate(value, code) {
    if (typeof value !== "string") throw runtimeError(code);
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
      throw runtimeError(code);
    }
  }

  function expectedSnapshotPath(revision, sha256) {
    return `${PRODUCTION_PREFIX}/releases/revision-${revision}-${sha256}.json`;
  }

  function validateRuntimeManifest(input) {
    if (!isObject(input)) throw runtimeError("WEB00_CLOUD_MANIFEST_INVALID");
    if (input.schemaVersion !== SCHEMA_VERSION) throw runtimeError("WEB00_CLOUD_MANIFEST_SCHEMA");
    if (!isPositiveSafeInteger(input.revision)) throw runtimeError("WEB00_CLOUD_REVISION_INVALID");
    if (!isNonNegativeSafeInteger(input.itemsCount)) throw runtimeError("WEB00_CLOUD_ITEM_COUNT_INVALID");
    if (!isSha256(input.sha256)) throw runtimeError("WEB00_CLOUD_SHA_INVALID");
    assertIsoDate(input.generatedAt, "WEB00_CLOUD_GENERATED_AT_INVALID");

    const snapshotPath = expectedSnapshotPath(input.revision, input.sha256);
    if (input.snapshotPath !== snapshotPath) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_PATH_INVALID");
    }
    let snapshotUrl;
    try {
      snapshotUrl = new URL(input.snapshotUrl);
    } catch (_) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_URL_INVALID");
    }
    if (
      snapshotUrl.origin !== APPROVED_ORIGIN ||
      snapshotUrl.pathname !== `/${snapshotPath}` ||
      snapshotUrl.search !== "" ||
      snapshotUrl.hash !== "" ||
      snapshotUrl.username !== "" ||
      snapshotUrl.password !== ""
    ) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_URL_INVALID");
    }

    return Object.freeze({
      generatedAt: input.generatedAt,
      itemsCount: input.itemsCount,
      revision: input.revision,
      schemaVersion: SCHEMA_VERSION,
      sha256: input.sha256,
      snapshotPath,
      snapshotUrl: snapshotUrl.href,
    });
  }

  function validateRuntimeSnapshot(input, manifest) {
    if (!isObject(input)) throw runtimeError("WEB00_CLOUD_SNAPSHOT_INVALID");
    if (input.schemaVersion !== SCHEMA_VERSION) throw runtimeError("WEB00_CLOUD_SNAPSHOT_SCHEMA");
    if (input.revision !== manifest.revision) throw runtimeError("WEB00_CLOUD_SNAPSHOT_REVISION");
    if (!Array.isArray(input.items)) throw runtimeError("WEB00_CLOUD_SNAPSHOT_ITEMS");
    if (input.itemsCount !== manifest.itemsCount || input.itemsCount !== input.items.length) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_ITEM_COUNT");
    }
    assertIsoDate(input.generatedAt, "WEB00_CLOUD_SNAPSHOT_GENERATED_AT");

    return Object.freeze({
      generatedAt: input.generatedAt,
      items: input.items,
      itemsCount: input.itemsCount,
      revision: input.revision,
      schemaVersion: SCHEMA_VERSION,
      settings: isObject(input.settings) ? input.settings : {},
    });
  }

  async function sha256HexFromArrayBuffer(buffer) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== "function") {
      throw runtimeError("WEB00_CLOUD_CRYPTO_UNAVAILABLE");
    }
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function fetchManifest(manifestUrl, signal) {
    if (manifestUrl !== MANIFEST_URL) throw runtimeError("WEB00_CLOUD_MANIFEST_URL_INVALID");
    const url = new URL(manifestUrl);
    url.searchParams.set("_", String(Date.now()));
    const response = await window.fetch(url.href, {
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
      signal,
    });
    if (!response || !response.ok) {
      throw runtimeError(`WEB00_CLOUD_MANIFEST_HTTP_${response ? response.status : "ERROR"}`);
    }
    const contentType = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : "";
    if (!/application\/json/i.test(contentType || "")) {
      throw runtimeError("WEB00_CLOUD_MANIFEST_CONTENT_TYPE");
    }
    return validateRuntimeManifest(await response.json());
  }

  async function fetchSnapshotBytes(snapshotUrl, signal) {
    const response = await window.fetch(snapshotUrl, {
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
      signal,
    });
    if (!response || !response.ok) {
      throw runtimeError(`WEB00_CLOUD_SNAPSHOT_HTTP_${response ? response.status : "ERROR"}`);
    }
    const contentType = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : "";
    if (!/application\/json/i.test(contentType || "")) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_CONTENT_TYPE");
    }
    if (typeof response.arrayBuffer !== "function") {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_BODY_UNAVAILABLE");
    }
    return response.arrayBuffer();
  }

  function parseSnapshot(bytes, manifest) {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = decoder.decode(bytes);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw runtimeError("WEB00_CLOUD_SNAPSHOT_JSON");
    }
    return validateRuntimeSnapshot(parsed, manifest);
  }

  async function loadCatalogFromRuntime(config, options = {}) {
    const manifest = await fetchManifest(config.catalogManifestUrl, options.signal);
    const snapshotBytes = await fetchSnapshotBytes(manifest.snapshotUrl, options.signal);
    const actualSha = await sha256HexFromArrayBuffer(snapshotBytes);
    if (actualSha !== manifest.sha256) {
      throw runtimeError("WEB00_CLOUD_SHA_MISMATCH");
    }
    return {
      manifest,
      snapshot: parseSnapshot(snapshotBytes, manifest),
    };
  }

  window.WEB00_CATALOG_RUNTIME = Object.freeze({
    loadCatalogFromRuntime,
    sha256HexFromArrayBuffer,
    validateRuntimeManifest,
    validateRuntimeSnapshot,
  });
})();
