(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    cacheName: "web00-public-catalog-lkg-v1",
    cacheRequestUrl: "https://web00.local/cache/public-catalog-lkg-v1.json",
    manifestUrl: "",
    maxBytes: 2 * 1024 * 1024,
    requestTimeoutMs: 8000,
  });
  const SNAPSHOT_SCHEMA_VERSION = 1;
  const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CHECKSUM_RE = /^[a-f0-9]{64}$/;
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
    const manifestUrl = text(raw.publicCatalogManifestUrl);

    return Object.freeze({
      cacheName: text(raw.publicCatalogCacheName) || DEFAULTS.cacheName,
      cacheRequestUrl: DEFAULTS.cacheRequestUrl,
      enabled: Boolean(sanitizeManifestUrl(manifestUrl)),
      manifestUrl: sanitizeManifestUrl(manifestUrl),
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

  function readSafeInteger(value, field) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw createSnapshotError(`WEB00_SNAPSHOT_INVALID_${field.toUpperCase()}`);
    }
    return number;
  }

  function validateManifest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw createSnapshotError("WEB00_MANIFEST_INVALID");
    }
    if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw createSnapshotError("WEB00_MANIFEST_SCHEMA");
    }
    const revision = readSafeInteger(value.revision, "revision");
    const itemsCount = readSafeInteger(value.itemsCount, "itemsCount");
    const sha256 = text(value.sha256);
    const snapshotPath = text(value.snapshotPath);
    const snapshotUrl = sanitizeSnapshotUrl(value.snapshotUrl);
    if (!CHECKSUM_RE.test(sha256) || !SNAPSHOT_OBJECT_PATH_RE.test(snapshotPath) || !snapshotUrl) {
      throw createSnapshotError("WEB00_MANIFEST_INVALID");
    }
    const urlPath = new URL(snapshotUrl).pathname;
    if (urlPath !== `/storage/v1/object/public/web00-catalog-images/${snapshotPath}`) {
      throw createSnapshotError("WEB00_MANIFEST_PATH_MISMATCH");
    }
    return Object.freeze({
      generatedAt: text(value.generatedAt),
      itemsCount,
      revision,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sha256,
      snapshotPath,
      snapshotUrl,
    });
  }

  function validateSnapshot(value, manifest) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw createSnapshotError("WEB00_SNAPSHOT_INVALID");
    }
    if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw createSnapshotError("WEB00_SNAPSHOT_SCHEMA");
    }
    const revision = readSafeInteger(value.revision, "revision");
    const itemsCount = readSafeInteger(value.itemsCount, "itemsCount");
    const settings = validateSettings(value.settings);
    if (!Array.isArray(value.items) || value.items.length !== itemsCount || value.items.length > 1000) {
      throw createSnapshotError("WEB00_SNAPSHOT_ITEMS");
    }
    if (manifest && (manifest.revision !== revision || manifest.itemsCount !== itemsCount)) {
      throw createSnapshotError("WEB00_SNAPSHOT_MANIFEST_MISMATCH");
    }
    const seen = new Set();
    const items = value.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw createSnapshotError("WEB00_SNAPSHOT_ITEM_INVALID");
      }
      const slug = text(item.slug);
      if (!SAFE_SLUG_RE.test(slug) || seen.has(slug)) {
        throw createSnapshotError("WEB00_SNAPSHOT_DUPLICATE_SLUG");
      }
      seen.add(slug);
      return item;
    });
    return Object.freeze({
      generatedAt: text(value.generatedAt),
      items,
      itemsCount,
      revision,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      settings,
    });
  }

  function validateSettings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.showDemoInModal !== "boolean") {
      throw createSnapshotError("WEB00_SNAPSHOT_SETTINGS");
    }
    return Object.freeze({
      showDemoInModal: value.showDemoInModal,
    });
  }

  async function loadManifest(options = {}) {
    const config = options.config || readConfig();
    if (!config.enabled) {
      throw createSnapshotError("WEB00_MANIFEST_NOT_CONFIGURED");
    }
    const channel = options.channel || createSnapshotRequestChannel();
    const request = channel.start(options.timeoutMs || config.requestTimeoutMs);
    try {
      const body = await fetchText(config.manifestUrl, {
        maxBytes: Math.min(config.maxBytes, 64 * 1024),
        signal: options.signal || request.signal,
      });
      return validateManifest(JSON.parse(body));
    } catch (error) {
      throw normalizeSnapshotError(error, "WEB00_MANIFEST_FETCH_FAILED");
    } finally {
      channel.finish(request.sequence);
    }
  }

  async function loadSnapshot(manifest, options = {}) {
    const verifiedManifest = validateManifest(manifest);
    const config = options.config || readConfig();
    const channel = options.channel || createSnapshotRequestChannel();
    const request = channel.start(options.timeoutMs || config.requestTimeoutMs);
    try {
      const body = await fetchText(verifiedManifest.snapshotUrl, {
        maxBytes: config.maxBytes,
        signal: options.signal || request.signal,
      });
      const checksumOk = await verifySnapshotChecksum(body, verifiedManifest.sha256);
      if (!checksumOk) {
        throw createSnapshotError("WEB00_SNAPSHOT_CHECKSUM_MISMATCH");
      }
      return validateSnapshot(JSON.parse(body), verifiedManifest);
    } catch (error) {
      throw normalizeSnapshotError(error, "WEB00_SNAPSHOT_FETCH_FAILED");
    } finally {
      channel.finish(request.sequence);
    }
  }

  async function fetchText(url, options) {
    if (typeof window.fetch !== "function") {
      throw createSnapshotError("WEB00_SNAPSHOT_FETCH_UNAVAILABLE");
    }
    const response = await window.fetch(url, {
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error",
      signal: options.signal,
    });
    if (!response || !response.ok) {
      throw createSnapshotError(`WEB00_SNAPSHOT_HTTP_${response ? response.status : "ERROR"}`);
    }
    const contentType = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : "";
    if (!/application\/json/i.test(contentType || "")) {
      throw createSnapshotError("WEB00_SNAPSHOT_CONTENT_TYPE");
    }
    const contentLength = Number(response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-length")
      : 0);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      throw createSnapshotError("WEB00_SNAPSHOT_BYTE_CAP");
    }
    if (typeof response.text !== "function") {
      throw createSnapshotError("WEB00_SNAPSHOT_TEXT_UNAVAILABLE");
    }
    const body = await response.text();
    if (byteLength(body) > options.maxBytes) {
      throw createSnapshotError("WEB00_SNAPSHOT_BYTE_CAP");
    }
    return body;
  }

  async function verifySnapshotChecksum(bytes, checksum) {
    if (!CHECKSUM_RE.test(text(checksum))) return false;
    const cryptoApi = window.crypto && window.crypto.subtle;
    if (!cryptoApi || typeof cryptoApi.digest !== "function") {
      throw createSnapshotError("WEB00_SNAPSHOT_CRYPTO_UNAVAILABLE");
    }
    const encoded = new TextEncoder().encode(String(bytes));
    const digest = await cryptoApi.digest("SHA-256", encoded);
    return hexDigest(digest) === checksum;
  }

  function normalizeSnapshotCatalog(snapshot) {
    const verified = validateSnapshot(snapshot);
    const catalog = window.WEB00_CATALOG;
    if (!catalog || typeof catalog.normalizeApiSite !== "function") {
      throw createSnapshotError("WEB00_CATALOG_NORMALIZER_UNAVAILABLE");
    }
    const seen = new Set();
    const items = verified.items.map((item) => {
      const normalized = catalog.normalizeApiSite(item, { source: "snapshot" });
      if (!normalized || seen.has(normalized.slug)) {
        throw createSnapshotError("WEB00_SNAPSHOT_DUPLICATE_SLUG");
      }
      seen.add(normalized.slug);
      return normalized;
    });
    if (verified.items.length > 0 && items.length === 0) {
      throw createSnapshotError("WEB00_SNAPSHOT_NO_VALID_ITEMS");
    }
    return catalogResult({
      items,
      revision: verified.revision,
      settings: verified.settings,
      source: "snapshot",
      sourceState: "CURRENT_READY",
    });
  }

  async function readLastKnownGood(options = {}) {
    const config = options.config || readConfig();
    if (!window.caches || typeof window.caches.open !== "function") {
      return null;
    }
    try {
      const cache = await window.caches.open(config.cacheName);
      const response = await cache.match(config.cacheRequestUrl);
      if (!response || typeof response.text !== "function") return null;
      const snapshot = validateSnapshot(JSON.parse(await response.text()));
      return snapshot;
    } catch (_) {
      await removeInvalidLastKnownGood({ config });
      return null;
    }
  }

  async function writeLastKnownGood(snapshot, options = {}) {
    const config = options.config || readConfig();
    if (!window.caches || typeof window.caches.open !== "function" || typeof window.Response !== "function") {
      return false;
    }
    try {
      const verified = validateSnapshot(snapshot);
      const existing = await readLastKnownGood({ config });
      if (existing && existing.revision > verified.revision) {
        return false;
      }
      const cache = await window.caches.open(config.cacheName);
      await cache.put(config.cacheRequestUrl, new window.Response(JSON.stringify(verified), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function removeInvalidLastKnownGood(options = {}) {
    const config = options.config || readConfig();
    if (!window.caches || typeof window.caches.open !== "function") {
      return false;
    }
    try {
      const cache = await window.caches.open(config.cacheName);
      if (typeof cache.delete === "function") {
        return await cache.delete(config.cacheRequestUrl);
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  async function resolveCatalogState(options = {}) {
    const kind = options.kind || "solutions";
    const limit = Number(options.limit || 3);
    const config = options.config || readConfig();
    let best = selectCatalogKind(catalogResult({
      items: Array.isArray(options.staticCatalog?.items) ? options.staticCatalog.items : [],
      revision: 0,
      settings: { showDemoInModal: false },
      source: "static",
      sourceState: "STATIC_READY",
    }), kind, limit);

    const upgrade = (state) => {
      const selected = selectCatalogKind(state, kind, limit);
      if (shouldUpgrade(best, selected)) {
        best = selected;
        if (typeof options.onUpgrade === "function") {
          options.onUpgrade(selected);
        }
      }
      return best;
    };

    const lkg = await readLastKnownGood({ config });
    if (lkg) {
      try {
        upgrade({
          ...normalizeSnapshotCatalog(lkg),
          source: "lkg",
          sourceState: "LKG_READY",
        });
      } catch (_) {
        await removeInvalidLastKnownGood({ config });
      }
    }

    if (!config.enabled) {
      return best.items.length ? best : fatalNoData("WEB00_MANIFEST_NOT_CONFIGURED");
    }

    try {
      const manifest = await loadManifest({ config });
      const snapshot = await loadSnapshot(manifest, { config });
      const current = normalizeSnapshotCatalog(snapshot);
      await writeLastKnownGood(snapshot, { config });
      return upgrade(current);
    } catch (error) {
      const code = error && error.code ? error.code : "WEB00_SNAPSHOT_ERROR";
      if (best.items.length) {
        return {
          ...best,
          errorCode: code,
          lifecycle: "degraded",
          sourceState: "DEGRADED_WITH_DATA",
          staticFallbackActive: true,
        };
      }
      return fatalNoData(code);
    }
  }

  function catalogResult(input) {
    return Object.freeze({
      apiAvailable: false,
      errorCode: "",
      items: input.items,
      lifecycle: input.items.length ? "ready" : "empty",
      revision: input.revision,
      settings: input.settings,
      source: input.source,
      sourceState: input.sourceState,
      staticFallbackActive: false,
    });
  }

  function selectCatalogKind(state, kind, limit) {
    if (kind !== "popular") return state;
    return {
      ...state,
      items: state.items.slice(0, Math.max(0, Math.min(20, limit))),
    };
  }

  function shouldUpgrade(current, candidate) {
    if (!candidate || !Array.isArray(candidate.items)) return false;
    if (current && Number(candidate.revision || 0) < Number(current.revision || 0)) return false;
    if (current && current.items.length > 0 && candidate.items.length === 0) return false;
    return true;
  }

  function fatalNoData(code) {
    return Object.freeze({
      apiAvailable: false,
      errorCode: code,
      items: [],
      lifecycle: "fatal",
      revision: 0,
      settings: { showDemoInModal: false },
      source: "none",
      sourceState: "FATAL_NO_DATA",
      staticFallbackActive: false,
    });
  }

  function createSnapshotRequestChannel() {
    let sequence = 0;
    let active = null;
    return {
      start(timeoutMs) {
        if (active) {
          if (active.timer) window.clearTimeout(active.timer);
          active.controller.abort(createSnapshotError("WEB00_SNAPSHOT_ABORTED"));
        }
        const controller = new AbortController();
        const current = sequence + 1;
        sequence = current;
        const timer = Number(timeoutMs) > 0
          ? window.setTimeout(() => controller.abort(createSnapshotError("WEB00_SNAPSHOT_TIMEOUT")), timeoutMs)
          : null;
        active = { controller, sequence: current, timer };
        return { sequence: current, signal: controller.signal };
      },
      finish(value) {
        if (!active || active.sequence !== value) return;
        if (active.timer) window.clearTimeout(active.timer);
        active = null;
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
    return createSnapshotError(fallbackCode);
  }

  function byteLength(value) {
    return new TextEncoder().encode(String(value)).byteLength;
  }

  function hexDigest(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  window.WEB00_PUBLIC_CATALOG_SNAPSHOT = Object.freeze({
    createSnapshotRequestChannel,
    loadManifest,
    loadSnapshot,
    normalizeSnapshotCatalog,
    readConfig,
    readLastKnownGood,
    removeInvalidLastKnownGood,
    resolveCatalogState,
    sanitizeManifestUrl,
    sanitizeSnapshotUrl,
    validateManifest,
    validateSnapshot,
    verifySnapshotChecksum,
    writeLastKnownGood,
  });
})();
