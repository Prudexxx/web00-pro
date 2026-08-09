const WEB00_CACHE = "web00-shell-v7-zero-stale";
const RUNTIME_VERSION = "zero-stale-catalog-v1";

const CATALOG_V2_RUNTIME_ASSETS = [
  `assets/js/catalog-v2/catalog-runtime.js?v=${RUNTIME_VERSION}`,
  `assets/js/catalog-v2/catalog-api.js?v=${RUNTIME_VERSION}`,
  `assets/js/catalog-v2/main.js?v=${RUNTIME_VERSION}`,
];

const SHELL_ASSETS = [
  "index.html",
  "app.html",
  "install.html",
  "status.html",
  "cabinet.html",
  "assets/css/tokens.css",
  "assets/css/base.css",
  "assets/css/shell.css",
  "assets/css/components.css",
  "assets/js/data.js",
  ...CATALOG_V2_RUNTIME_ASSETS,
  "assets/icons/web00-icon-192.png",
  "assets/icons/web00-icon-512.png",
  "assets/icons/web00-maskable-512.png",
];

function isRuntimeConfigRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith("/assets/js/runtime-config.js");
}

function isCatalogDataRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith("/assets/js/data.js");
}

function isCatalogV2RuntimeRequest(url) {
  return url.origin === self.location.origin && (
    url.pathname.endsWith("/assets/js/catalog-v2/catalog-runtime.js") ||
    url.pathname.endsWith("/assets/js/catalog-v2/catalog-api.js") ||
    url.pathname.endsWith("/assets/js/catalog-v2/main.js")
  );
}

function isApiRequest(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/api/") || url.pathname === "/api");
}

function catalogDataCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
}

async function networkFirstCatalogData(request) {
  let networkResponse;
  let networkError;

  try {
    networkResponse = await fetch(request, { cache: "no-store" });
    if (networkResponse.ok) {
      const cache = await caches.open(WEB00_CACHE);
      await cache.put(catalogDataCacheKey(request), networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    networkError = error;
  }

  const cache = await caches.open(WEB00_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }
  if (networkResponse) {
    return networkResponse;
  }

  throw networkError || new TypeError("WEB00 catalog data unavailable.");
}

async function networkFirstExactRuntime(request) {
  let networkResponse;
  let networkError;

  try {
    networkResponse = await fetch(request, { cache: "no-store" });
    if (networkResponse.ok) {
      const cache = await caches.open(WEB00_CACHE);
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    networkError = error;
  }

  const cache = await caches.open(WEB00_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  if (networkResponse) {
    return networkResponse;
  }

  throw networkError || new TypeError("WEB00 runtime unavailable.");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(WEB00_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("web00-shell-") && key !== WEB00_CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isRuntimeConfigRequest(url) || isApiRequest(url)) return;
  if (url.origin !== self.location.origin) return;

  if (isCatalogDataRequest(url)) {
    event.respondWith(networkFirstCatalogData(request));
    return;
  }

  if (isCatalogV2RuntimeRequest(url)) {
    event.respondWith(networkFirstExactRuntime(request));
    return;
  }

  // No personal/project data is cached in this frontend-only service worker.
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(WEB00_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("index.html")))
    );
    return;
  }

  if (url.pathname.endsWith(".css") || SHELL_ASSETS.some((asset) => url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(WEB00_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }))
    );
  }
});
