(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    manifestUrl: "",
    maxBytes: 2 * 1024 * 1024,
    requestTimeoutMs: 8000,
  });
  const SNAPSHOT_SCHEMA_VERSION = 1;
  const MAX_CATALOG_ITEMS = 1000;
  const CHECKSUM_RE = /^[a-f0-9]{64}$/;
  const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const TRUSTED_STORAGE_ORIGIN = "https://qcizrrqkvdgpcgvnnfpb.supabase.co";
  const TRUSTED_STORAGE_PREFIX = "/storage/v1/object/public/web00-catalog-images/public-catalog/v1/";
  const MANIFEST_PATH = `${TRUSTED_STORAGE_PREFIX}manifest.json`;
  const SNAPSHOT_OBJECT_PATH_RE = /^public-catalog\/v1\/snapshots\/revision-[1-9][0-9]*\.json$/;
  const SNAPSHOT_PATH_RE = /^\/storage\/v1\/object\/public\/web00-catalog-images\/public-catalog\/v1\/snapshots\/revision-[1-9][0-9]*\.json$/;

  function text(value) {
    return String(value ?? "").trim();
  }

  function readConfig(input = window.WEB00_CONFIG) {
    const raw = input && typeof input === "object" ? input : {};
    const timeout = Number(raw.publicCatalogRequestTimeoutMs ?? raw.requestTimeoutMs);
    const maxBytes = Number(raw.publicCatalogMaxBytes);
    const manifestUrl = sanitizeManifestUrl(raw.publicCatalogManifestUrl);

    return Object.freeze({
      enabled: Boolean(manifestUrl),
      manifestUrl,
      maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= DEFAULTS.maxBytes
        ? maxBytes
        : DEFAULTS.maxBytes,
      requestTimeoutMs: Number.isFinite(timeout) && timeout >= 1000 && timeout <= 30000
        ? Math.round(timeout)
        : DEFAULTS.requestTimeoutMs,
    });
  }

  function sanitizeManifestUrl(value) {
    const raw = text(value);
    if (!raw) return "";
    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      return "";
    }
    if (
      url.origin !== TRUSTED_STORAGE_ORIGIN ||
      url.pathname !== MANIFEST_PATH ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    return url.href;
  }

  function sanitizeSnapshotUrl(value) {
    const raw = text(value);
    if (!raw) return "";
    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      return "";
    }
    if (
      url.origin !== TRUSTED_STORAGE_ORIGIN ||
      !SNAPSHOT_PATH_RE.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    return url.href;
  }

  function safeInteger(value, field, options = {}) {
    const number = Number(value);
    const min = options.min ?? 0;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw createSnapshotError(`WEB00_PUBLIC_CATALOG_INVALID_${field.toUpperCase()}`);
    }
    return number;
  }

  function validateManifest(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_MANIFEST");
    }
    if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_MANIFEST");
    }
    const revision = safeInteger(input.revision, "revision", { min: 1 });
    const itemsCount = safeInteger(input.itemsCount, "items_count", { min: 1, max: MAX_CATALOG_ITEMS });
    const sha256 = text(input.sha256 || input.checksum).replace(/^sha256-/i, "");
    const snapshotPath = text(input.snapshotPath);
    const snapshotUrl = sanitizeSnapshotUrl(input.snapshotUrl);
    if (!CHECKSUM_RE.test(sha256) || !SNAPSHOT_OBJECT_PATH_RE.test(snapshotPath) || !snapshotUrl) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_MANIFEST");
    }
    const urlPath = new URL(snapshotUrl).pathname;
    if (urlPath !== `/storage/v1/object/public/web00-catalog-images/${snapshotPath}`) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_MANIFEST");
    }
    return Object.freeze({
      generatedAt: text(input.generatedAt),
      itemsCount,
      revision,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sha256,
      snapshotPath,
      snapshotUrl,
    });
  }

  function validateSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.showDemoInModal !== "boolean") {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }
    return Object.freeze({
      showDemoInModal: input.showDemoInModal,
    });
  }

  function validateSnapshot(input, manifest) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }
    if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }
    const revision = safeInteger(input.revision, "revision", { min: 1 });
    const itemsCount = safeInteger(input.itemsCount, "items_count", { min: 1, max: MAX_CATALOG_ITEMS });
    const settings = validateSettings(input.settings);
    if (!Array.isArray(input.items) || input.items.length !== itemsCount || input.items.length > MAX_CATALOG_ITEMS) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }
    if (manifest && (manifest.revision !== revision || manifest.itemsCount !== itemsCount)) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }

    const seen = new Set();
    const items = input.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
      }
      const slug = text(item.slug);
      if (!SAFE_SLUG_RE.test(slug) || seen.has(slug)) {
        throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
      }
      seen.add(slug);
      return item;
    });
    const popularSeen = new Set();
    const popular = (Array.isArray(input.popular) ? input.popular : []).map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
      }
      const slug = text(item.slug);
      if (!SAFE_SLUG_RE.test(slug) || !seen.has(slug) || popularSeen.has(slug)) {
        throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
      }
      popularSeen.add(slug);
      return item;
    });
    if (popular.length > 20) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
    }

    return Object.freeze({
      generatedAt: text(input.generatedAt),
      items,
      itemsCount,
      popular,
      revision,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      settings,
    });
  }

  async function loadManifest(options = {}) {
    const config = options.config || readConfig();
    if (!config.enabled) throw createSnapshotError("WEB00_PUBLIC_CATALOG_MANIFEST_NOT_CONFIGURED");
    const request = createTimeoutSignal(options.timeoutMs || config.requestTimeoutMs);
    try {
      const body = await fetchText(config.manifestUrl, {
        maxBytes: Math.min(config.maxBytes, 64 * 1024),
        signal: options.signal || request.signal,
      });
      return validateManifest(JSON.parse(body));
    } catch (error) {
      throw normalizeSnapshotError(error, "WEB00_PUBLIC_CATALOG_MANIFEST_FETCH_FAILED");
    } finally {
      request.clear();
    }
  }

  async function loadSnapshot(manifest, options = {}) {
    const verifiedManifest = validateManifest(manifest);
    const config = options.config || readConfig();
    const request = createTimeoutSignal(options.timeoutMs || config.requestTimeoutMs);
    try {
      const bytes = await fetchText(verifiedManifest.snapshotUrl, {
        maxBytes: config.maxBytes,
        signal: options.signal || request.signal,
      });
      if (!await verifySnapshotChecksum(bytes, verifiedManifest.sha256)) {
        throw createSnapshotError("WEB00_PUBLIC_CATALOG_CHECKSUM_MISMATCH");
      }
      return validateSnapshot(JSON.parse(bytes), verifiedManifest);
    } catch (error) {
      throw normalizeSnapshotError(error, "WEB00_PUBLIC_CATALOG_SNAPSHOT_FETCH_FAILED");
    } finally {
      request.clear();
    }
  }

  async function fetchText(url, options = {}) {
    if (typeof window.fetch !== "function") {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_FETCH_UNAVAILABLE");
    }
    const response = await window.fetch(url, {
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
      signal: options.signal,
    });
    if (!response || !response.ok) {
      throw createSnapshotError(`WEB00_PUBLIC_CATALOG_HTTP_${response ? response.status : "ERROR"}`);
    }
    const contentType = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : "";
    if (!/application\/json/i.test(contentType || "")) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_CONTENT_TYPE");
    }
    const contentLength = Number(response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-length")
      : 0);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_BYTE_CAP");
    }
    if (typeof response.text !== "function") {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_TEXT_UNAVAILABLE");
    }
    const body = await response.text();
    if (byteLength(body) > options.maxBytes) {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_BYTE_CAP");
    }
    return body;
  }

  async function verifySnapshotChecksum(bytes, checksum) {
    const normalized = text(checksum).replace(/^sha256-/i, "");
    if (!CHECKSUM_RE.test(normalized)) return false;
    const cryptoApi = window.crypto && window.crypto.subtle;
    if (!cryptoApi || typeof cryptoApi.digest !== "function") {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_CRYPTO_UNAVAILABLE");
    }
    const encoded = new TextEncoder().encode(String(bytes));
    const digest = await cryptoApi.digest("SHA-256", encoded);
    return hexDigest(digest) === normalized;
  }

  function normalizeSnapshotCatalog(snapshot, options = {}) {
    const verified = validateSnapshot(snapshot);
    const catalog = options.catalog || window.WEB00_CATALOG;
    if (!catalog || typeof catalog.normalizeApiSite !== "function") {
      throw createSnapshotError("WEB00_PUBLIC_CATALOG_NORMALIZER_UNAVAILABLE");
    }
    const normalizeItems = (items, source) => {
      const seen = new Set();
      return items.map((item) => {
        const normalized = catalog.normalizeApiSite(item, { source });
        if (!normalized || seen.has(normalized.slug)) {
          throw createSnapshotError("WEB00_PUBLIC_CATALOG_INVALID_SNAPSHOT");
        }
        seen.add(normalized.slug);
        return normalized;
      });
    };
    const items = normalizeItems(verified.items, options.source || "snapshot");
    const popularItems = verified.popular.length
      ? normalizeItems(verified.popular, options.source || "snapshot")
      : [];
    return catalogResult({
      items,
      popularItems,
      revision: verified.revision,
      settings: verified.settings,
      source: options.source || "snapshot",
      sourceState: options.sourceState || "SNAPSHOT_READY",
    });
  }

  async function resolveCatalogState(options = {}) {
    const kind = options.kind || "solutions";
    const limit = Number(options.limit || 3);
    const config = options.config || readConfig();
    const currentState = options.currentState;
    try {
      const manifest = await loadManifest({ config });
      const currentRevision = Number(currentState && currentState.revision);
      if (
        hasCatalogItems(currentState) &&
        Number.isSafeInteger(currentRevision) &&
        currentRevision >= manifest.revision
      ) {
        if (kind !== "popular" && typeof options.saveLastKnownGoodCatalog === "function") {
          options.saveLastKnownGoodCatalog(currentState);
        }
        return {
          ...selectCatalogKind(currentState, kind, limit),
          apiAvailable: false,
          errorCode: "",
          lifecycle: "ready",
          staticFallbackActive: false,
          unchanged: true,
        };
      }

      const snapshot = await loadSnapshot(manifest, { config });
      const fullState = normalizeSnapshotCatalog(snapshot, {
        catalog: options.catalog,
        source: "snapshot",
        sourceState: "SNAPSHOT_READY",
      });
      if (typeof options.saveLastKnownGoodCatalog === "function") {
        options.saveLastKnownGoodCatalog(fullState);
      }
      return selectCatalogKind(fullState, kind, limit);
    } catch (error) {
      const errorCode = error && error.code ? error.code : "WEB00_PUBLIC_CATALOG_ERROR";
      const fallback = typeof options.preserveCatalogState === "function"
        ? options.preserveCatalogState(errorCode)
        : currentState;
      if (hasCatalogItems(fallback)) {
        return {
          ...selectCatalogKind(fallback, kind, limit),
          apiAvailable: false,
          degraded: true,
          errorCode,
          lifecycle: "ready",
          staticFallbackActive: true,
        };
      }
      return catalogResult({
        items: [],
        revision: 0,
        settings: { showDemoInModal: false },
        source: "snapshot",
        sourceState: "FATAL_NO_DATA",
      }, {
        errorCode,
        lifecycle: "fatal",
        staticFallbackActive: false,
      });
    }
  }

  function selectCatalogKind(state, kind, limit) {
    if (kind !== "popular") return state;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 3;
    const popularItems = Array.isArray(state.popularItems) && state.popularItems.length
      ? state.popularItems
      : state.items;
    return {
      ...state,
      items: popularItems.slice(0, safeLimit),
    };
  }

  function catalogResult(input, flags = {}) {
    const items = Array.isArray(input.items) ? input.items : [];
    return Object.freeze({
      apiAvailable: false,
      degraded: flags.degraded === true,
      errorCode: flags.errorCode || "",
      items,
      lifecycle: flags.lifecycle || (items.length ? "ready" : "empty"),
      popularItems: Array.isArray(input.popularItems) ? input.popularItems : [],
      revision: input.revision,
      settings: input.settings,
      source: input.source,
      sourceState: input.sourceState,
      staticFallbackActive: flags.staticFallbackActive === true,
    });
  }

  function hasCatalogItems(state) {
    return Boolean(state && Array.isArray(state.items) && state.items.length > 0);
  }

  function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timeout = Number(timeoutMs);
    const timer = Number.isFinite(timeout) && timeout > 0
      ? window.setTimeout(() => controller.abort(createSnapshotError("WEB00_PUBLIC_CATALOG_TIMEOUT")), timeout)
      : null;
    return {
      signal: controller.signal,
      clear() {
        if (timer) window.clearTimeout(timer);
      },
    };
  }

  function createSnapshotError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function normalizeSnapshotError(error, fallbackCode) {
    if (error && error.code) return error;
    if (error && error.name === "AbortError") return createSnapshotError("WEB00_PUBLIC_CATALOG_TIMEOUT");
    return createSnapshotError(fallbackCode);
  }

  function byteLength(value) {
    const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
    if (encoder) return encoder.encode(String(value)).byteLength;
    return String(value).length;
  }

  function hexDigest(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  window.WEB00_PUBLIC_CATALOG_SNAPSHOT = Object.freeze({
    loadManifest,
    loadSnapshot,
    normalizeSnapshotCatalog,
    readConfig,
    resolveCatalogState,
    sanitizeManifestUrl,
    sanitizeSnapshotUrl,
    validateManifest,
    validateSnapshot,
    verifySnapshotChecksum,
  });
})();
