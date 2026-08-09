(function () {
  "use strict";

  const APPROVED_ORIGIN = "https://web00-public-runtime.s3-website.cloud.ru";
  const MANIFEST_URL = `${APPROVED_ORIGIN}/runtime/production/catalog/v1/manifest.json`;
  const PRODUCTION_PREFIX = "runtime/production/catalog/v1";
  const SCHEMA_VERSION = 1;
  const VERIFIED_CACHE_NAME = "web00-catalog-verified-v1";
  const VERIFIED_METADATA_KEY = "web00.catalog.verified.v1";
  const VERIFIED_METADATA_SCHEMA_VERSION = 1;
  const DEFAULT_MANIFEST_TIMEOUT_MS = 8000;
  const MAX_MANIFEST_TIMEOUT_MS = 30000;

  let activeManifestRequest = null;
  let primedManifestResult = null;

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

  function cloneArrayBuffer(buffer) {
    return buffer.slice(0);
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

  function normalizedManifestTimeoutMs(config) {
    const value = Number(config && config.requestTimeoutMs);
    return Number.isFinite(value) && value >= 1 && value <= MAX_MANIFEST_TIMEOUT_MS
      ? Math.round(value)
      : DEFAULT_MANIFEST_TIMEOUT_MS;
  }

  function externalAbortReason(signal) {
    return signal && "reason" in signal && signal.reason !== undefined
      ? signal.reason
      : runtimeError("WEB00_CLOUD_MANIFEST_ABORTED");
  }

  async function fetchManifestBounded(config, options = {}) {
    const controller = new AbortController();
    const timeoutMs = normalizedManifestTimeoutMs(config);
    const timer = window.setTimeout(() => {
      controller.abort(runtimeError("WEB00_CLOUD_MANIFEST_TIMEOUT"));
    }, timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternal = () => {
      if (!controller.signal.aborted) controller.abort(externalAbortReason(externalSignal));
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        abortFromExternal();
      } else if (typeof externalSignal.addEventListener === "function") {
        externalSignal.addEventListener("abort", abortFromExternal, { once: true });
      }
    }

    try {
      return await fetchManifest(config && config.catalogManifestUrl, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason !== undefined) throw reason;
        throw runtimeError("WEB00_CLOUD_MANIFEST_ABORTED");
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (externalSignal && typeof externalSignal.removeEventListener === "function") {
        externalSignal.removeEventListener("abort", abortFromExternal);
      }
    }
  }

  function createManifestRequest(config, options = {}) {
    const request = {
      consumedByCatalogLoad: false,
      promise: null,
    };
    request.promise = fetchManifestBounded(config, options);
    return request;
  }

  function primeManifest(config, options = {}) {
    if (activeManifestRequest) return activeManifestRequest.promise;

    primedManifestResult = null;
    const request = createManifestRequest(config, options);
    activeManifestRequest = request;
    request.promise = request.promise
      .then((manifest) => {
        if (!request.consumedByCatalogLoad) {
          primedManifestResult = { manifest, request };
        }
        return manifest;
      })
      .catch((error) => {
        if (primedManifestResult && primedManifestResult.request === request) {
          primedManifestResult = null;
        }
        throw error;
      })
      .finally(() => {
        if (activeManifestRequest === request) {
          activeManifestRequest = null;
        }
      });
    return request.promise;
  }

  async function readManifestForLoad(config, options = {}) {
    if (activeManifestRequest) {
      const request = activeManifestRequest;
      request.consumedByCatalogLoad = true;
      try {
        return await request.promise;
      } finally {
        if (primedManifestResult && primedManifestResult.request === request) {
          primedManifestResult = null;
        }
      }
    }

    if (primedManifestResult) {
      const result = primedManifestResult.manifest;
      primedManifestResult = null;
      return result;
    }

    return fetchManifestBounded(config, options);
  }

  function hasCacheStorage() {
    return window.caches && typeof window.caches.open === "function";
  }

  function hasLocalStorage() {
    return window.localStorage &&
      typeof window.localStorage.getItem === "function" &&
      typeof window.localStorage.setItem === "function";
  }

  function validateVerifiedIdentity(input) {
    const manifest = validateRuntimeManifest(input);
    assertIsoDate(input.savedAt, "WEB00_VERIFIED_METADATA_SAVED_AT_INVALID");
    return Object.freeze({
      ...manifest,
      savedAt: input.savedAt,
    });
  }

  function tryValidateVerifiedIdentity(input) {
    try {
      return input ? validateVerifiedIdentity(input) : null;
    } catch (_) {
      return null;
    }
  }

  function readVerifiedMetadata() {
    if (!hasLocalStorage()) return null;
    let raw;
    try {
      raw = window.localStorage.getItem(VERIFIED_METADATA_KEY);
    } catch (_) {
      return null;
    }
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    if (!isObject(parsed) || parsed.schemaVersion !== VERIFIED_METADATA_SCHEMA_VERSION) {
      return null;
    }

    return Object.freeze({
      current: tryValidateVerifiedIdentity(parsed.current),
      previous: tryValidateVerifiedIdentity(parsed.previous),
      schemaVersion: VERIFIED_METADATA_SCHEMA_VERSION,
    });
  }

  function identityMatchesManifest(identity, manifest) {
    return Boolean(identity) &&
      identity.schemaVersion === manifest.schemaVersion &&
      identity.revision === manifest.revision &&
      identity.sha256 === manifest.sha256 &&
      identity.snapshotPath === manifest.snapshotPath &&
      identity.snapshotUrl === manifest.snapshotUrl &&
      identity.itemsCount === manifest.itemsCount &&
      identity.generatedAt === manifest.generatedAt;
  }

  function identityContentKey(identity) {
    return identity
      ? [
        identity.schemaVersion,
        identity.revision,
        identity.sha256,
        identity.snapshotPath,
        identity.snapshotUrl,
        identity.itemsCount,
        identity.generatedAt,
      ].join("|")
      : "";
  }

  function identityFromManifest(manifest) {
    return Object.freeze({
      generatedAt: manifest.generatedAt,
      itemsCount: manifest.itemsCount,
      revision: manifest.revision,
      savedAt: new Date().toISOString(),
      schemaVersion: VERIFIED_METADATA_SCHEMA_VERSION,
      sha256: manifest.sha256,
      snapshotPath: manifest.snapshotPath,
      snapshotUrl: manifest.snapshotUrl,
    });
  }

  async function readVerifiedSnapshot(identity) {
    const verifiedIdentity = validateVerifiedIdentity(identity);
    if (!hasCacheStorage()) throw runtimeError("WEB00_VERIFIED_CACHE_UNAVAILABLE");
    const cache = await window.caches.open(VERIFIED_CACHE_NAME);
    const response = await cache.match(verifiedIdentity.snapshotUrl);
    if (!response || typeof response.arrayBuffer !== "function") {
      throw runtimeError("WEB00_VERIFIED_CACHE_MISSING");
    }
    const bytes = await response.arrayBuffer();
    const actualSha = await sha256HexFromArrayBuffer(bytes);
    if (actualSha !== verifiedIdentity.sha256) {
      await cache.delete(verifiedIdentity.snapshotUrl).catch(() => false);
      throw runtimeError("WEB00_VERIFIED_CACHE_SHA_MISMATCH");
    }
    const manifest = validateRuntimeManifest(verifiedIdentity);
    const snapshot = parseSnapshot(bytes, manifest);
    return { manifest, snapshot };
  }

  async function tryReadCurrentVerifiedMatch(manifest) {
    const metadata = readVerifiedMetadata();
    if (!metadata || !identityMatchesManifest(metadata.current, manifest)) return null;
    try {
      return await readVerifiedSnapshot(metadata.current);
    } catch (_) {
      return null;
    }
  }

  function writeVerifiedMetadata(identity) {
    if (!hasLocalStorage()) throw runtimeError("WEB00_VERIFIED_METADATA_UNAVAILABLE");
    const existing = readVerifiedMetadata();
    const newKey = identityContentKey(identity);
    let previous = null;

    if (existing && existing.current) {
      previous = identityContentKey(existing.current) === newKey
        ? existing.previous
        : existing.current;
    } else if (existing && existing.previous && identityContentKey(existing.previous) !== newKey) {
      previous = existing.previous;
    }

    window.localStorage.setItem(VERIFIED_METADATA_KEY, JSON.stringify({
      current: identity,
      previous,
      schemaVersion: VERIFIED_METADATA_SCHEMA_VERSION,
    }));
  }

  async function tryCommitVerifiedSnapshot(manifest, snapshotBytes) {
    if (!hasCacheStorage() || !window.Response) return "write-failed";
    const identity = identityFromManifest(manifest);
    try {
      const cache = await window.caches.open(VERIFIED_CACHE_NAME);
      await cache.put(manifest.snapshotUrl, new window.Response(cloneArrayBuffer(snapshotBytes), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }));
      writeVerifiedMetadata(identity);
      return "miss";
    } catch (_) {
      return "write-failed";
    }
  }

  async function loadCatalogFromRuntime(config, options = {}) {
    const manifest = await readManifestForLoad(config, options);
    const cached = await tryReadCurrentVerifiedMatch(manifest);
    if (cached) {
      return {
        ...cached,
        cacheStatus: "hit",
        freshness: "ready-current",
        transport: "verified-cache",
      };
    }

    const snapshotBytes = await fetchSnapshotBytes(manifest.snapshotUrl, options.signal);
    const actualSha = await sha256HexFromArrayBuffer(snapshotBytes);
    if (actualSha !== manifest.sha256) {
      throw runtimeError("WEB00_CLOUD_SHA_MISMATCH");
    }
    const snapshot = parseSnapshot(snapshotBytes, manifest);
    const cacheStatus = await tryCommitVerifiedSnapshot(manifest, snapshotBytes);
    return {
      cacheStatus,
      freshness: "ready-current",
      manifest,
      snapshot,
      transport: "network",
    };
  }

  async function loadVerifiedFallback() {
    const metadata = readVerifiedMetadata();
    if (!metadata) return null;
    const seen = new Set();
    const candidates = [metadata.current, metadata.previous].filter((identity) => {
      const key = identityContentKey(identity);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const identity of candidates) {
      try {
        const result = await readVerifiedSnapshot(identity);
        return {
          ...result,
          cacheStatus: "fallback",
          freshness: "degraded-verified",
          transport: "verified-cache",
        };
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  window.WEB00_CATALOG_RUNTIME = Object.freeze({
    primeManifest,
    loadCatalogFromRuntime,
    loadVerifiedFallback,
    sha256HexFromArrayBuffer,
    validateRuntimeManifest,
    validateRuntimeSnapshot,
  });
})();
