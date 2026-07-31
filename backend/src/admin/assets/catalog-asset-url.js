export const CATALOG_PUBLIC_ASSET_BASE = "https://prudexxx.github.io/web00-pro/";

const maxCatalogAssetUrlLength = 2048;
const legacyWeb00Prefix = "/web00-pro/";
const allowedAbsoluteProtocols = new Set(["http:", "https:"]);
const blockedSchemesPattern = /^[a-z][a-z0-9+.-]*:/i;
const unsafeLegacyPathCharacters = /[\u0000-\u001F\u007F<>"'`{}|^[\]]/u;

export function resolveCatalogAssetUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (text.length === 0 || text.length > maxCatalogAssetUrlLength) {
    return null;
  }
  if (text.includes("\\") || text.startsWith("//")) {
    return null;
  }

  const decoded = decodeUrlComponentSafely(text);
  if (decoded === null) {
    return null;
  }
  if (decoded !== text && blockedSchemesPattern.test(decoded)) {
    return null;
  }

  const absolute = resolveAbsoluteUrl(text);
  if (absolute !== null) {
    return absolute;
  }

  return resolveLegacyAssetPath(decoded);
}

function resolveAbsoluteUrl(text) {
  if (!blockedSchemesPattern.test(text)) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  if (!allowedAbsoluteProtocols.has(parsed.protocol)) {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }

  return {
    source: "absolute",
    url: parsed.href
  };
}

function resolveLegacyAssetPath(text) {
  const legacyPath = normalizeLegacyAssetPath(text);
  if (legacyPath === null || !isSafeLegacyAssetPath(legacyPath)) {
    return null;
  }

  const url = new URL(legacyPath, CATALOG_PUBLIC_ASSET_BASE);
  if (!url.href.startsWith(CATALOG_PUBLIC_ASSET_BASE)) {
    return null;
  }

  return {
    source: "legacy",
    url: url.href
  };
}

function normalizeLegacyAssetPath(text) {
  if (text.startsWith("assets/")) {
    return text;
  }
  if (text.startsWith("./assets/")) {
    return text.slice(2);
  }
  if (text.startsWith(`${legacyWeb00Prefix}assets/`)) {
    return text.slice(legacyWeb00Prefix.length);
  }

  return null;
}

function isSafeLegacyAssetPath(path) {
  if (!path.startsWith("assets/")) {
    return false;
  }
  if (path.includes("\\") || path.includes(":") || unsafeLegacyPathCharacters.test(path)) {
    return false;
  }
  if (/\s/u.test(path)) {
    return false;
  }

  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function decodeUrlComponentSafely(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}
