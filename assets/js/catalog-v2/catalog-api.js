(function () {
  "use strict";

  const CONFIG_DEFAULTS = Object.freeze({
    apiBaseUrl: "",
    catalogManifestUrl: "",
    catalogRuntimeMode: "static",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: false,
  });

  const CLOUD_PRIMARY_MANIFEST_URL = "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json";
  const LKG_KEY = "web00.catalog.api.lkg.v1";
  const LKG_SCHEMA_VERSION = 1;
  const MAX_CATALOG_ITEMS = 1000;
  const MAX_LKG_SERIALIZED_BYTES = 2 * 1024 * 1024;
  const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CONTROL_RE = /[\u0000-\u001f\u007f]/;
  const ENCODED_CONTROL_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
  const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const CHANNELS = new Map();
  const hasOwn = Object.prototype.hasOwnProperty;
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeArray(values, options = {}) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
      const normalized = text(value);
      if (!normalized) return;
      const output = options.lowercase ? normalized.toLocaleLowerCase("ru-RU") : normalized;
      const key = output.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) return;
      seen.add(key);
      result.push(output);
    });
    return result;
  }

  function isLocalHttp(url) {
    return url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname);
  }

  function hasUnsafePercentEncoding(value) {
    let current = value;
    for (let index = 0; index < 4; index += 1) {
      if (ENCODED_CONTROL_RE.test(current)) return true;
      if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(current)) return true;
      let decoded;
      try {
        decoded = decodeURIComponent(current.replace(/%(?![0-9a-f]{2})/gi, "%25"));
      } catch (_) {
        return true;
      }
      if (CONTROL_RE.test(decoded) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decoded)) return true;
      if (decoded === current) return false;
      current = decoded;
    }
    return /%/.test(current);
  }

  function isSafeRelativePath(value) {
    if (!value || CONTROL_RE.test(value) || hasUnsafePercentEncoding(value)) return false;
    if (value.includes("\\")) return false;
    if (value.startsWith("//")) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
    if (value.startsWith("/api") || value === "/api") return false;
    if (value.startsWith("../") || value.includes("/../") || value === "..") return false;
    if (value.startsWith("./../")) return false;
    return true;
  }

  function sanitizePublicUrl(value, options = {}) {
    const raw = text(value);
    if (!raw || raw.includes("\\") || CONTROL_RE.test(raw) || hasUnsafePercentEncoding(raw)) return "";
    if (raw.startsWith("//")) return "";

    const purpose = options.purpose || "destination";
    const allowRelative = options.allowRelative === true;

    if (allowRelative && isSafeRelativePath(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return raw;
    }

    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      return "";
    }

    if (url.username || url.password || url.hash) return "";
    if (purpose === "apiBase" && url.search) return "";
    if (url.protocol !== "https:" && !isLocalHttp(url)) return "";
    if (purpose === "apiBase") {
      url.hash = "";
      url.search = "";
      return url.href.replace(/\/+$/, "");
    }
    if (url.search && purpose === "image") return "";
    return url.href;
  }

  function validateConfig(input = window.WEB00_CONFIG) {
    const raw = input && typeof input === "object" ? input : {};
    const hasRoutingDirective = input && typeof input === "object" && (
      hasOwn.call(input, "apiBaseUrl") ||
      hasOwn.call(input, "catalogManifestUrl") ||
      hasOwn.call(input, "catalogRuntimeMode")
    );
    const timeout = Number(raw.requestTimeoutMs);
    const requestTimeoutMs = Number.isFinite(timeout) && timeout >= 1 && timeout <= 30000
      ? Math.round(timeout)
      : CONFIG_DEFAULTS.requestTimeoutMs;
    const catalogRuntimeMode =
      raw.catalogRuntimeMode === "cloud-primary" &&
      raw.catalogManifestUrl === CLOUD_PRIMARY_MANIFEST_URL
        ? "cloud-primary"
        : !hasRoutingDirective
          ? "cloud-primary"
          : CONFIG_DEFAULTS.catalogRuntimeMode;
    const staticFallbackEnabled = typeof raw.staticFallbackEnabled === "boolean"
      ? raw.staticFallbackEnabled
      : catalogRuntimeMode === "cloud-primary"
        ? true
        : CONFIG_DEFAULTS.staticFallbackEnabled;
    const catalogManifestUrl = catalogRuntimeMode === "cloud-primary"
      ? CLOUD_PRIMARY_MANIFEST_URL
      : CONFIG_DEFAULTS.catalogManifestUrl;
    const rawBase = text(raw.apiBaseUrl);

    if (!rawBase) {
      return Object.freeze({
        apiBaseUrl: "",
        apiEnabled: false,
        catalogManifestUrl,
        catalogRuntimeMode,
        requestTimeoutMs,
        staticFallbackEnabled,
        valid: true,
      });
    }

    const apiBaseUrl = sanitizePublicUrl(rawBase, { purpose: "apiBase" });
    return Object.freeze({
      apiBaseUrl,
      apiEnabled: Boolean(apiBaseUrl),
      catalogManifestUrl,
      catalogRuntimeMode,
      requestTimeoutMs,
      staticFallbackEnabled,
      valid: Boolean(apiBaseUrl),
    });
  }

  function getConfig() {
    return validateConfig();
  }

  function moneyFromCents(value) {
    const cents = Number(value);
    if (!Number.isFinite(cents) || cents <= 0) return "";
    const rubles = Math.round(cents / 100);
    return `от ${String(rubles).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
  }

  function slugify(value) {
    return text(value)
      .toLocaleLowerCase("ru-RU")
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "services";
  }

  function normalizeImage(input, fallback = {}) {
    if (!input) return null;
    const source = typeof input === "string" ? { url: input } : input;
    const url = sanitizePublicUrl(source.url || source.storagePath || fallback.url, {
      purpose: "image",
      allowRelative: true,
    });
    if (!url) return null;
    return {
      url,
      alt: text(source.alt) || text(fallback.alt),
      variants: normalizeImageVariants(source.variants || fallback.variants || []),
    };
  }

  function normalizeGalleryImages(images, fallback = {}) {
    return (Array.isArray(images) ? images : [])
      .map((image, index) => {
        const source = typeof image === "string" ? { url: image, sortOrder: index } : image;
        return { image: normalizeImage(source, fallback), sortOrder: Number(source.sortOrder ?? index) };
      })
      .filter((entry) => entry.image)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((entry) => entry.image);
  }

  function normalizeApiSite(input, options = {}) {
    if (!input || typeof input !== "object") return null;
    const slug = text(input.slug);
    const title = text(input.title);
    if (!SAFE_SLUG_RE.test(slug) || !title) return null;

    const previewImageUrl = sanitizePublicUrl(input.previewImageUrl, {
      purpose: "image",
      allowRelative: true,
    });
    const previewImage = normalizeImage(input.previewImage, { url: previewImageUrl, alt: title });
    const galleryImages = normalizeGalleryImages(input.galleryImages, { alt: title });

    return {
      key: slug,
      id: slug,
      slug,
      title,
      shortDescription: text(input.shortDescription),
      category: text(input.category && input.category.title),
      categorySlug: text(input.category && input.category.slug) || "services",
      tags: normalizeArray(input.tags, { lowercase: true }),
      features: normalizeArray(input.features),
      priceLabel: text(input.priceLabel) || moneyFromCents(input.priceAmountCents),
      deliveryLabel: text(input.deliveryLabel) || (Number(input.developmentDays) > 0 ? `от ${Number(input.developmentDays)} дней` : ""),
      demoMode: text(input.demoMode),
      demoUrl: sanitizePublicUrl(input.demoUrl, { purpose: "destination", allowRelative: true }),
      siteUrl: sanitizePublicUrl(input.siteUrl, { purpose: "destination" }),
      previewImageUrl,
      previewImage,
      galleryImages,
      source: options.source || "api",
      aliases: [slug],
    };
  }

  function normalizeStaticSite(input, options = {}) {
    if (!input || typeof input !== "object" || input.active === false) return null;
    const id = text(input.id);
    const slug = text(input.slug) || id;
    const title = text(input.title);
    if (!id || !SAFE_SLUG_RE.test(slug) || !title) return null;

    const previewImageUrl = sanitizePublicUrl(input.previewImage, {
      purpose: "image",
      allowRelative: true,
    });
    const previewImage = normalizeImage(previewImageUrl, { alt: title });
    const galleryImages = normalizeGalleryImages(input.galleryImages, { alt: title });
    const demoUrl = input.demoUrl || input.demoLocalUrl || input.externalDemoUrl || input.originalDemoUrl || "";
    const aliases = [id];
    const legacyTitle = text(input.legacyTitle);
    if (legacyTitle && legacyTitle !== id && legacyTitle !== title) aliases.push(legacyTitle);
    normalizeArray(input.aliases).forEach((alias) => {
      if (!aliases.includes(alias)) aliases.push(alias);
    });

    return {
      key: slug,
      id,
      slug,
      title,
      shortDescription: text(input.description),
      category: text(input.category),
      categorySlug: text(input.filter) || text(input.previewType) || slugify(input.category),
      tags: normalizeArray(input.tags),
      features: normalizeArray(input.features || input.includes),
      priceLabel: text(input.priceFrom),
      deliveryLabel: text(input.deliveryTime),
      demoMode: text(input.demoMode),
      demoUrl: sanitizePublicUrl(demoUrl, { purpose: "internal", allowRelative: true }),
      siteUrl: sanitizePublicUrl(input.siteUrl, { purpose: "destination" }),
      previewImageUrl,
      previewImage,
      galleryImages: galleryImages.length ? galleryImages : (previewImage ? [previewImage] : []),
      source: options.source || "static",
      aliases,
    };
  }

  function getStaticCatalog(options = {}) {
    const source = options.source || "static";
    const seen = new Set();
    const items = ((window.WEB00_DATA && window.WEB00_DATA.SOLUTIONS) || [])
      .map((item) => normalizeStaticSite(item, { source }))
      .filter((item) => {
        if (!item || seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
    return {
      source,
      lifecycle: items.length ? "ready" : "empty",
      items,
      settings: normalizeCatalogSettings(),
      errorCode: "",
    };
  }

  function normalizeCatalogSettings(settings) {
    return {
      showDemoInModal: settings?.showDemoInModal === true,
    };
  }

  function normalizeCachedCatalogItem(input) {
    if (!input || typeof input !== "object") return null;
    const category = input.category && typeof input.category === "object"
      ? input.category
      : { slug: input.categorySlug, title: input.category };
    return normalizeApiSite({
      slug: input.slug,
      title: input.title,
      shortDescription: input.shortDescription,
      category,
      tags: input.tags,
      features: input.features,
      priceLabel: input.priceLabel,
      deliveryLabel: input.deliveryLabel,
      demoMode: input.demoMode,
      demoUrl: input.demoUrl,
      siteUrl: input.siteUrl,
      previewImageUrl: input.previewImageUrl,
      previewImage: input.previewImage,
      galleryImages: input.galleryImages,
    }, { source: "lkg" });
  }

  function normalizeCachedCatalogItems(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_CATALOG_ITEMS) return null;
    const seen = new Set();
    const normalized = [];
    for (const item of items) {
      const safeItem = normalizeCachedCatalogItem(item);
      if (!safeItem || seen.has(safeItem.slug)) return null;
      seen.add(safeItem.slug);
      normalized.push(safeItem);
    }
    return normalized;
  }

  function serializedByteLength(value) {
    const source = String(value ?? "");
    let size = 0;
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      if (code <= 0x7f) {
        size += 1;
      } else if (code <= 0x7ff) {
        size += 2;
      } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
        const next = source.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          size += 4;
          index += 1;
        } else {
          size += 3;
        }
      } else {
        size += 3;
      }
    }
    return size;
  }

  function readLastKnownGoodCatalog() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(LKG_KEY);
      if (!raw || serializedByteLength(raw) > MAX_LKG_SERIALIZED_BYTES) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.schemaVersion !== LKG_SCHEMA_VERSION || typeof payload.savedAt !== "string") return null;
      const savedAt = new Date(payload.savedAt);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.savedAt) || Number.isNaN(savedAt.getTime()) || savedAt.toISOString() !== payload.savedAt) return null;
      const items = normalizeCachedCatalogItems(payload.items);
      return items ? { source: "lkg", lifecycle: "ready", items, settings: normalizeCatalogSettings(), errorCode: "" } : null;
    } catch (_) {
      return null;
    }
  }

  function saveLastKnownGoodCatalog(items) {
    const safeItems = normalizeCachedCatalogItems(items);
    if (!safeItems) return false;
    const payload = {
      schemaVersion: LKG_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      items: safeItems,
    };
    try {
      const serialized = JSON.stringify(payload);
      if (serializedByteLength(serialized) > MAX_LKG_SERIALIZED_BYTES) return false;
      if (!window.localStorage || typeof window.localStorage.setItem !== "function") return false;
      window.localStorage.setItem(LKG_KEY, serialized);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getInitialCatalog(options = {}) {
    if (getConfig().catalogRuntimeMode === "cloud-primary") {
      return limitCatalogState(bootstrapCatalogState(), options.limit);
    }
    const staticCatalog = getStaticCatalog();
    const cachedCatalog = readLastKnownGoodCatalog();
    const initial = hasCatalogItems(staticCatalog) ? staticCatalog : cachedCatalog || staticCatalog;
    return limitCatalogState(initial, options.limit);
  }

  function limitItems(items, limit) {
    const source = Array.isArray(items) ? items : [];
    const value = Number(limit);
    if (!Number.isInteger(value) || value <= 0) return source;
    return source.slice(0, value);
  }

  function limitCatalogState(state, limit) {
    const items = limitItems(state && state.items, limit);
    if (state && items === state.items) return state;
    const lifecycle = state && (state.lifecycle === "loading" || state.lifecycle === "fatal")
      ? state.lifecycle
      : (items.length ? "ready" : "empty");
    return { ...state, lifecycle, items };
  }

  function bootstrapCatalogState() {
    return {
      source: "bootstrap",
      lifecycle: "loading",
      freshness: "bootstrap",
      transport: "none",
      revision: null,
      sha256: "",
      items: [],
      settings: normalizeCatalogSettings(),
      errorCode: "",
      apiAvailable: false,
      staticFallbackActive: false,
      degraded: false,
    };
  }

  function findCatalogItem(items, identifier) {
    const value = text(identifier);
    if (!value) return null;
    return (Array.isArray(items) ? items : []).find((item) => {
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      return item.key === value || item.id === value || item.slug === value || aliases.includes(value);
    }) || null;
  }

  function createCatalogError(code, message) {
    const error = new Error(code);
    error.code = code;
    error.publicMessage = message || code;
    return error;
  }

  function normalizeImageVariants(variants) {
    const seenWidths = new Set();
    return (Array.isArray(variants) ? variants : [])
      .map((variant) => {
        const width = Number(variant && variant.width);
        const normalizedWidth = Number.isFinite(width) ? Math.round(width) : 0;
        if (normalizedWidth <= 0 || seenWidths.has(normalizedWidth)) return null;
        const avifUrl = sanitizePublicUrl(variant.avifUrl, { purpose: "image", allowRelative: true });
        const webpUrl = sanitizePublicUrl(variant.webpUrl, { purpose: "image", allowRelative: true });
        if (!avifUrl || !webpUrl) return null;
        seenWidths.add(normalizedWidth);
        return { avifUrl, webpUrl, width: normalizedWidth };
      })
      .filter(Boolean)
      .sort((left, right) => left.width - right.width);
  }

  function buildSrcset(variants, field) {
    return (Array.isArray(variants) ? variants : [])
      .map((variant) => `${variant[field]} ${variant.width}w`)
      .join(", ");
  }

  function buildResponsiveImageModel(image, fallback = {}) {
    const normalized = normalizeImage(image, fallback);
    if (!normalized) return null;
    const variants = normalizeImageVariants(normalized.variants);
    const avifSrcset = buildSrcset(variants, "avifUrl");
    const webpSrcset = buildSrcset(variants, "webpUrl");
    const largestWebp = variants.length ? variants[variants.length - 1].webpUrl : "";
    return {
      url: largestWebp || normalized.url,
      alt: normalized.alt,
      avifSrcset,
      webpSrcset,
      loading: fallback.loading || "lazy",
      hasPicture: Boolean(avifSrcset && webpSrcset),
    };
  }

  function renderResponsiveImageHtml(model, options = {}) {
    if (!model || !model.url) return "";
    const className = options.className ? ` class="${escapeAttribute(options.className)}"` : "";
    const attributes = text(options.attributes)
      .split(/\s+/)
      .filter((token) => /^(?:data|aria)-[a-z0-9-]+(?:="[^"]*")?$/i.test(token))
      .join(" ");
    const attributePrefix = attributes ? ` ${attributes}` : "";
    const image = `<img${attributePrefix}${className} src="${escapeAttribute(model.url)}" alt="${escapeAttribute(model.alt)}" loading="${escapeAttribute(model.loading || "lazy")}" decoding="async">`;
    if (!model.hasPicture) return image;
    return `<picture><source type="image/avif" srcset="${escapeAttribute(model.avifSrcset)}"><source type="image/webp" srcset="${escapeAttribute(model.webpSrcset)}">${image}</picture>`;
  }

  function normalizeApiItems(data, options = {}) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(data) ? data : []).forEach((entry) => {
      const item = normalizeApiSite(entry, { source: options.source || "api" });
      if (!item) return;
      if (seen.has(item.slug)) {
        throw createCatalogError("WEB00_API_DUPLICATE_SLUG");
      }
      seen.add(item.slug);
      normalized.push(item);
    });
    if (normalized.length !== data.length) {
      throw createCatalogError("WEB00_API_NO_VALID_ITEMS");
    }
    return normalized;
  }

  function cloudErrorCode(error) {
    const code = text(error && error.code);
    if (!code) return "WEB00_CLOUD_ERROR";
    if (code.startsWith("WEB00_API_")) return `WEB00_CLOUD_${code.slice("WEB00_API_".length)}`;
    return code;
  }

  function normalizeCloudItems(data) {
    try {
      return normalizeApiItems(data, { source: "cloud" });
    } catch (error) {
      throw createCatalogError(cloudErrorCode(error));
    }
  }

  function stateFromRuntimeResult(result, items, options = {}) {
    const manifest = result && result.manifest && typeof result.manifest === "object" ? result.manifest : {};
    const snapshot = result && result.snapshot && typeof result.snapshot === "object" ? result.snapshot : {};
    const freshness = text(result && result.freshness) || "degraded-verified";
    return {
      source: "cloud",
      lifecycle: items.length ? "ready" : "empty",
      freshness,
      transport: text(result && result.transport) || "none",
      revision: manifest.revision ?? null,
      sha256: text(manifest.sha256),
      items,
      settings: normalizeCatalogSettings(snapshot.settings),
      errorCode: options.errorCode || "",
      apiAvailable: false,
      staticFallbackActive: freshness !== "ready-current",
      degraded: freshness !== "ready-current",
    };
  }

  function validateMeta(meta, expectedPage, expectedLimit) {
    if (!meta || typeof meta !== "object") {
      throw createCatalogError("WEB00_API_INVALID_META");
    }
    const page = Number(meta.page);
    const limit = Number(meta.limit);
    const total = Number(meta.total);
    const totalPages = Number(meta.totalPages);
    if (![page, limit, total, totalPages].every((value) => Number.isInteger(value) && value >= 0)) {
      throw createCatalogError("WEB00_API_INVALID_META");
    }
    if (page !== expectedPage || limit !== expectedLimit || totalPages > 20) {
      throw createCatalogError("WEB00_API_INVALID_META");
    }
    if ((total === 0 && totalPages !== 0) || (total > 0 && totalPages === 0)) {
      throw createCatalogError("WEB00_API_INVALID_META");
    }
    return { page, limit, total, totalPages };
  }

  function catalogResultFromItems(items, source, settings) {
    return {
      source,
      lifecycle: items.length ? "ready" : "empty",
      items,
      settings: normalizeCatalogSettings(settings),
      errorCode: "",
    };
  }

  async function loadAllSites(options = {}) {
    const config = options.config || getConfig();
    if (!config.apiEnabled) return getStaticCatalog();
    const items = await loadPaginatedSites({
      config,
      limit: 20,
      path: "/api/sites",
      signal: options.signal,
      sort: "sortOrder",
    });
    return catalogResultFromItems(items, "api");
  }

  async function loadCloudRuntimeCatalog(options = {}) {
    const config = options.config || getConfig();
    if (config.catalogRuntimeMode !== "cloud-primary") {
      throw createCatalogError("WEB00_CLOUD_NOT_CONFIGURED");
    }
    const runtime = window.WEB00_CATALOG_RUNTIME;
    if (!runtime || typeof runtime.loadCatalogFromRuntime !== "function") {
      throw createCatalogError("WEB00_CLOUD_RUNTIME_UNAVAILABLE");
    }
    const result = await runtime.loadCatalogFromRuntime(config, { signal: options.signal });
    const items = limitItems(normalizeCloudItems(result.snapshot.items), options.limit);
    return stateFromRuntimeResult(result, items);
  }

  async function loadPopularSites(options = { limit: 3 }) {
    const config = options.config || getConfig();
    const limit = Number(options.limit || 3);
    if (!config.apiEnabled) {
      const staticItems = getStaticCatalog().items.slice(0, limit);
      return catalogResultFromItems(staticItems, "static");
    }
    const envelope = await fetchJson(buildApiUrl("/api/sites/popular", { limit }, config), {
      signal: options.signal,
    });
    const items = normalizeApiItems(envelope.data || []);
    return catalogResultFromItems(items, "api");
  }

  async function loadSiteDetail(slug, options = {}) {
    const config = getConfig();
    if (config.apiEnabled && SAFE_SLUG_RE.test(text(slug))) {
      const envelope = await fetchJson(buildApiUrl(`/api/sites/${text(slug)}`, {}, config), {
        signal: options.signal,
      });
      const item = normalizeApiSite(envelope.data);
      if (!item) throw createCatalogError("WEB00_API_NO_VALID_ITEMS");
      return catalogResultFromItems([item], "api");
    }
    const item = findCatalogItem(getStaticCatalog().items, slug);
    return item ? catalogResultFromItems([item], "static") : catalogResultFromItems([], "static");
  }

  async function loadCategoryDetail(slug, options = {}) {
    const config = getConfig();
    if (!config.apiEnabled || !SAFE_SLUG_RE.test(text(slug))) return getStaticCatalog();
    const params = {
      includeSites: "true",
      limit: Number(options.limit || 20),
      page: Number(options.page || 1),
      sort: options.sort || "sortOrder",
    };
    const envelope = await fetchJson(buildApiUrl(`/api/categories/${text(slug)}`, params, config), {
      signal: options.signal,
    });
    const sourceItems = envelope.data && Array.isArray(envelope.data.sites) ? envelope.data.sites : [];
    return catalogResultFromItems(normalizeApiItems(sourceItems), "api");
  }

  function withStateFlags(result, flags = {}) {
    return {
      source: result.source,
      lifecycle: result.lifecycle,
      items: result.items || [],
      settings: normalizeCatalogSettings(result.settings),
      errorCode: result.errorCode || "",
      apiAvailable: flags.apiAvailable === true,
      staticFallbackActive: flags.staticFallbackActive === true,
      degraded: flags.degraded === true,
    };
  }

  function hasCatalogItems(state) {
    return Boolean(state && Array.isArray(state.items) && state.items.length > 0);
  }

  function fatalCloudState(errorCode) {
    return {
      source: "cloud",
      lifecycle: "fatal",
      freshness: "fatal",
      transport: "none",
      revision: null,
      sha256: "",
      items: [],
      settings: normalizeCatalogSettings(),
      errorCode: errorCode || "WEB00_CLOUD_ERROR",
      apiAvailable: false,
      staticFallbackActive: false,
      degraded: true,
    };
  }

  function staticDisasterState(errorCode, limit) {
    const config = getConfig();
    if (!config.staticFallbackEnabled) return fatalCloudState(errorCode);
    const staticCatalog = getStaticCatalog();
    if (!hasCatalogItems(staticCatalog)) return fatalCloudState(errorCode);
    const items = limitItems(staticCatalog.items, limit);
    if (!items.length) return fatalCloudState(errorCode);
    return {
      source: "static",
      lifecycle: "ready",
      freshness: "degraded-static",
      transport: "static",
      revision: null,
      sha256: "",
      items,
      settings: normalizeCatalogSettings(),
      errorCode: errorCode || "WEB00_CLOUD_ERROR",
      apiAvailable: false,
      staticFallbackActive: true,
      degraded: true,
    };
  }

  async function resolveCloudPrimaryCatalog(options, request) {
    const config = options.config || getConfig();
    const runtime = window.WEB00_CATALOG_RUNTIME;
    if (!runtime || typeof runtime.loadCatalogFromRuntime !== "function") {
      return staticDisasterState("WEB00_CLOUD_RUNTIME_UNAVAILABLE", options.limit);
    }

    try {
      const result = await runtime.loadCatalogFromRuntime(config, { signal: request.signal });
      const items = limitItems(normalizeCloudItems(result.snapshot.items), options.limit);
      return stateFromRuntimeResult(result, items);
    } catch (error) {
      const errorCode = cloudErrorCode(error);
      if (typeof runtime.loadVerifiedFallback === "function") {
        try {
          const fallback = await runtime.loadVerifiedFallback();
          if (fallback) {
            try {
              const items = limitItems(normalizeCloudItems(fallback.snapshot.items), options.limit);
              return stateFromRuntimeResult(fallback, items, { errorCode });
            } catch (_) {
              // Corrupt verified bytes are not authoritative; fall through to static disaster.
            }
          }
        } catch (_) {
          // Verified fallback is best effort; the original current error remains the public state.
        }
      }
      return staticDisasterState(errorCode, options.limit);
    }
  }

  function preservedCatalogState(currentState, errorCode, flags = {}) {
    const config = flags.config || getConfig();
    const staticCatalog = config.staticFallbackEnabled ? getStaticCatalog() : null;
    const cachedCatalog = readLastKnownGoodCatalog();
    const fallback = hasCatalogItems(currentState)
      ? currentState
      : (hasCatalogItems(staticCatalog) ? staticCatalog : cachedCatalog);
    if (hasCatalogItems(fallback)) {
      return withStateFlags({
        source: fallback.source,
        lifecycle: "ready",
        items: fallback.items,
        settings: normalizeCatalogSettings(),
        errorCode,
      }, {
        apiAvailable: flags.apiAvailable === true,
        staticFallbackActive: true,
        degraded: true,
      });
    }
    return withStateFlags({
      source: "api",
      lifecycle: errorCode === "WEB00_API_EMPTY" ? "empty" : "fatal",
      items: [],
      errorCode,
    }, {
      apiAvailable: flags.apiAvailable === true,
      staticFallbackActive: false,
      degraded: true,
    });
  }

  function getRequestChannel(name) {
    const key = text(name) || "catalog";
    if (!CHANNELS.has(key)) CHANNELS.set(key, createRequestChannel());
    return CHANNELS.get(key);
  }

  async function resolveCatalogForPage(options = {}) {
    const kind = options.kind || "solutions";
    const config = getConfig();
    const currentState = options.currentState;
    if (!config.apiEnabled && config.catalogRuntimeMode !== "cloud-primary") {
      return withStateFlags(getInitialCatalog({ limit: kind === "popular" ? options.limit : undefined }), {
        apiAvailable: false,
        staticFallbackActive: false,
      });
    }

    const channel = getRequestChannel(kind === "popular" ? "popular" : "catalog");
    const request = channel.start(config.requestTimeoutMs);

    try {
      let result;
      if (config.catalogRuntimeMode === "cloud-primary" && (kind === "solutions" || kind === "popular")) {
        result = await resolveCloudPrimaryCatalog({
          config,
          limit: kind === "popular" ? options.limit || 3 : options.limit,
        }, request);
        if (channel.isStale(request.sequence)) {
          return null;
        }
        return result;
      } else {
        result = kind === "popular"
          ? await loadPopularSites({ limit: options.limit || 3, signal: request.signal, config })
          : await loadAllSites({ signal: request.signal, config });
      }
      if (channel.isStale(request.sequence)) {
        return null;
      }
      if (!hasCatalogItems(result)) {
        return withStateFlags(result, { apiAvailable: true, staticFallbackActive: false });
      }
      if (kind === "solutions" && (result.source === "cloud" || result.source === "api")) {
        saveLastKnownGoodCatalog(result.items);
      }
      return withStateFlags(result, {
        apiAvailable: result.source === "api",
        staticFallbackActive: false,
      });
    } catch (error) {
      const errorCode = error && error.code ? error.code : (request.signal.aborted ? "WEB00_API_ABORTED" : "WEB00_API_ERROR");
      if (channel.isStale(request.sequence)) {
        return null;
      }
      return preservedCatalogState(currentState, errorCode, { config });
    } finally {
      channel.finish(request.sequence);
    }
  }

  function buildApiUrl(path, params = {}, config = getConfig()) {
    if (!config || !config.apiEnabled) throw createCatalogError("WEB00_API_NOT_CONFIGURED");
    const url = new URL(path, config.apiBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    return url.href;
  }

  async function fetchJson(url, options = {}) {
    if (typeof window.fetch !== "function") throw createCatalogError("WEB00_API_FETCH_UNAVAILABLE");
    const response = await window.fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: options.signal,
    });
    if (!response || !response.ok) {
      throw createCatalogError(`WEB00_API_HTTP_${response ? response.status : "ERROR"}`);
    }
    const contentType = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("content-type")
      : "";
    if (!/application\/json/i.test(contentType || "")) {
      throw createCatalogError("WEB00_API_CONTENT_TYPE");
    }
    let body;
    try {
      body = await response.json();
    } catch (_) {
      throw createCatalogError("WEB00_API_INVALID_JSON");
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.data)) {
      throw createCatalogError("WEB00_API_INVALID_ENVELOPE");
    }
    return body;
  }

  async function loadPaginatedSites(options = {}) {
    const config = options.config || getConfig();
    if (!config.apiEnabled) return [];
    const limit = Number(options.limit || 20);
    const path = options.path || "/api/sites";
    const items = [];
    let page = 1;
    let totalPages = 1;
    let expectedTotal = null;

    while (page <= totalPages && page <= 20 && items.length < MAX_CATALOG_ITEMS) {
      const params = { page, limit };
      if (options.sort) params.sort = options.sort;
      const envelope = await fetchJson(buildApiUrl(path, params, config), { signal: options.signal });
      const meta = validateMeta(envelope.meta, page, limit);
      if (expectedTotal === null) expectedTotal = meta.total;
      if (meta.total !== expectedTotal) throw createCatalogError("WEB00_API_INVALID_META");
      totalPages = meta.totalPages || 0;
      const pageItems = normalizeApiItems(envelope.data);
      items.push(...pageItems);
      if (items.length > MAX_CATALOG_ITEMS) throw createCatalogError("WEB00_API_ITEM_CAP");
      if (pageItems.length > limit) throw createCatalogError("WEB00_API_INVALID_META");
      if (page < totalPages && pageItems.length === 0) throw createCatalogError("WEB00_API_INVALID_META");
      if (totalPages === 0 || page >= totalPages) break;
      page += 1;
    }

    if (items.length > MAX_CATALOG_ITEMS) throw createCatalogError("WEB00_API_ITEM_CAP");
    if (expectedTotal === null || items.length !== expectedTotal) throw createCatalogError("WEB00_API_INVALID_META");
    const seen = new Set();
    items.forEach((item) => {
      if (seen.has(item.slug)) throw createCatalogError("WEB00_API_DUPLICATE_SLUG");
      seen.add(item.slug);
    });
    return items.slice(0, MAX_CATALOG_ITEMS);
  }

  function createRequestChannel() {
    let sequence = 0;
    let active = null;
    return {
      get controller() {
        return active ? active.controller : null;
      },
      start(timeoutMs) {
        if (active) {
          if (active.timer) window.clearTimeout(active.timer);
          active.controller.abort();
        }
        const controller = new AbortController();
        const current = sequence + 1;
        sequence = current;
        const timeout = Number(timeoutMs);
        const timer = Number.isFinite(timeout) && timeout > 0
          ? window.setTimeout(() => controller.abort(createCatalogError("WEB00_API_TIMEOUT")), timeout)
          : null;
        active = { controller, sequence: current, timer };
        return { sequence: current, signal: controller.signal };
      },
      isStale(value) {
        return value !== sequence;
      },
      finish(value) {
        if (!active || active.sequence !== value) return;
        if (active.timer) window.clearTimeout(active.timer);
        active = null;
      },
    };
  }

  function resolveCatalogState() {
    return resolveCatalogForPage();
  }

  window.WEB00_CATALOG = Object.freeze({
    getConfig,
    getStaticCatalog,
    getInitialCatalog,
    loadAllSites,
    loadCloudRuntimeCatalog,
    loadPopularSites,
    loadSiteDetail,
    loadCategoryDetail,
    resolveCatalogForPage,
    normalizeApiSite,
    normalizeStaticSite,
    findCatalogItem,
    buildResponsiveImageModel,
    renderResponsiveImageHtml,
    sanitizePublicUrl,
    escapeHtml,
    escapeAttribute,
  });

  if (window.WEB00_TEST_MODE === true) {
    window.WEB00_CATALOG_TESTS = Object.freeze({
      validateConfig,
      buildApiUrl,
      fetchJson,
      loadPaginatedSites,
      createRequestChannel,
      resolveCatalogState,
      normalizeImageVariants,
      buildSrcset,
      readLastKnownGoodCatalog,
      saveLastKnownGoodCatalog,
    });
  }
})();
