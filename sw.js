const WEB00_CACHE = "web00-shell-v5-catalog-lkg";

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
  "assets/js/catalog-api.js",
  "assets/js/main.js",
  "assets/icons/web00-icon-192.png",
  "assets/icons/web00-icon-512.png",
  "assets/icons/web00-maskable-512.png"
];

function isRuntimeConfigRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith("/assets/js/runtime-config.js");
}

function isApiRequest(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/api/") || url.pathname === "/api");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(WEB00_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
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
