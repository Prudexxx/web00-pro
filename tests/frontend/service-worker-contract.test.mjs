import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("service worker keeps network-only config/API, v7 cache identity, and exact catalog-v2 runtime caching", async () => {
  const source = await readFile("sw.js", "utf8");
  const shellStart = source.indexOf("const SHELL_ASSETS");
  const shellAssets = source.slice(shellStart, source.indexOf("];", shellStart) + 2);
  const runtimeStart = source.indexOf("const CATALOG_V2_RUNTIME_ASSETS");
  const runtimeAssets = source.slice(runtimeStart, source.indexOf("];", runtimeStart) + 2);
  const fetchHandler = source.slice(source.indexOf('self.addEventListener("fetch"'));
  const runtimeExactStart = source.indexOf("async function networkFirstExactRuntime");
  const networkFirstExactRuntime = source.slice(runtimeExactStart, source.indexOf('self.addEventListener("install"', runtimeExactStart));
  const runtimeConfigGuard = fetchHandler.indexOf("if (isRuntimeConfigRequest(url) || isApiRequest(url)) return;");
  const originGuard = fetchHandler.indexOf("if (url.origin !== self.location.origin) return;");
  const dataGuard = fetchHandler.indexOf("if (isCatalogDataRequest(url))");
  const runtimeGuard = fetchHandler.indexOf("if (isCatalogV2RuntimeRequest(url))");
  const firstCacheRead = fetchHandler.indexOf("caches.match");
  const firstCacheOpen = fetchHandler.indexOf("caches.open");
  const firstCachePut = fetchHandler.indexOf("cache.put");

  assert.match(source, /const WEB00_CACHE = "web00-shell-v7-zero-stale";/);
  assert.match(source, /const RUNTIME_VERSION = "zero-stale-catalog-v1";/);
  assert.match(source, /const CATALOG_V2_RUNTIME_ASSETS = \[/);
  assert.match(source, /function isRuntimeConfigRequest\(url\)/);
  assert.match(source, /function isCatalogDataRequest\(url\)/);
  assert.match(source, /function isCatalogV2RuntimeRequest\(url\)/);
  assert.match(source, /function isApiRequest\(url\)/);
  assert.match(source, /async function networkFirstCatalogData\(request\)/);
  assert.match(source, /async function networkFirstExactRuntime\(request\)/);
  assert.match(source, /if \(isRuntimeConfigRequest\(url\) \|\| isApiRequest\(url\)\) return;/);
  assert.match(source, /if \(isCatalogDataRequest\(url\)\) \{\s*event\.respondWith\(networkFirstCatalogData\(request\)\);\s*return;\s*\}/);
  assert.match(source, /if \(isCatalogV2RuntimeRequest\(url\)\) \{\s*event\.respondWith\(networkFirstExactRuntime\(request\)\);\s*return;\s*\}/);
  assert.match(source, /url\.pathname\.endsWith\("\/assets\/js\/runtime-config\.js"\)/);
  assert.match(source, /url\.pathname\.endsWith\("\/assets\/js\/data\.js"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\) \|\| url\.pathname === "\/api"/);

  assert.match(runtimeAssets, /`assets\/js\/catalog-v2\/catalog-runtime\.js\?v=\$\{RUNTIME_VERSION\}`/);
  assert.match(runtimeAssets, /`assets\/js\/catalog-v2\/catalog-api\.js\?v=\$\{RUNTIME_VERSION\}`/);
  assert.match(runtimeAssets, /`assets\/js\/catalog-v2\/main\.js\?v=\$\{RUNTIME_VERSION\}`/);
  assert.match(shellAssets, /"assets\/js\/data\.js"/);
  assert.match(shellAssets, /\.\.\.CATALOG_V2_RUNTIME_ASSETS/);
  assert.doesNotMatch(shellAssets, /runtime-config\.js/);
  assert.doesNotMatch(shellAssets, /"assets\/js\/catalog-runtime\.js"/);
  assert.doesNotMatch(shellAssets, /"assets\/js\/catalog-api\.js"/);
  assert.doesNotMatch(shellAssets, /"assets\/js\/main\.js"/);
  assert.doesNotMatch(shellAssets, /manifest\.json|web00-public-runtime/);

  assert.match(networkFirstExactRuntime, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(networkFirstExactRuntime, /cache\.put\(request, networkResponse\.clone\(\)\)/);
  assert.match(networkFirstExactRuntime, /cache\.match\(request\)/);
  assert.doesNotMatch(networkFirstExactRuntime, /ignoreSearch/);
  assert.match(source, /caches\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(source, /key\.startsWith\("web00-shell-"\) && key !== WEB00_CACHE/);
  assert.doesNotMatch(source, /caches\.delete\(WEB00_CACHE\)|caches\.delete\(key\)(?!\))/);

  assert.notEqual(runtimeConfigGuard, -1);
  assert.notEqual(originGuard, -1);
  assert.notEqual(dataGuard, -1);
  assert.notEqual(runtimeGuard, -1);
  assert.ok(runtimeConfigGuard < firstCacheRead);
  assert.ok(runtimeConfigGuard < firstCacheOpen);
  assert.ok(runtimeConfigGuard < firstCachePut);
  assert.ok(originGuard < firstCacheRead);
  assert.ok(originGuard < firstCacheOpen);
  assert.ok(originGuard < firstCachePut);
  assert.ok(dataGuard < runtimeGuard, "data.js must keep its query-insensitive LKG behavior before exact v2 runtime caching");
});
