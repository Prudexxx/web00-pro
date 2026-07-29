import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("service worker keeps runtime config and API requests network-only", async () => {
  const source = await readFile("sw.js", "utf8");
  const shellAssets = source.slice(source.indexOf("const SHELL_ASSETS"), source.indexOf("];") + 2);
  const fetchHandler = source.slice(source.indexOf('self.addEventListener("fetch"'));
  const runtimeConfigGuard = fetchHandler.indexOf("if (isRuntimeConfigRequest(url) || isApiRequest(url)) return;");
  const originGuard = fetchHandler.indexOf("if (url.origin !== self.location.origin) return;");
  const firstCacheRead = fetchHandler.indexOf("caches.match");
  const firstCacheOpen = fetchHandler.indexOf("caches.open");
  const firstCachePut = fetchHandler.indexOf("cache.put");

  assert.match(source, /const WEB00_CACHE = "web00-shell-v4-b8-live-api";/);
  assert.match(source, /function isRuntimeConfigRequest\(url\)/);
  assert.match(source, /function isApiRequest\(url\)/);
  assert.match(source, /if \(isRuntimeConfigRequest\(url\) \|\| isApiRequest\(url\)\) return;/);
  assert.match(source, /url\.pathname\.endsWith\("\/assets\/js\/runtime-config\.js"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\) \|\| url\.pathname === "\/api"/);
  assert.doesNotMatch(source, /url\.href|url\.search/);
  assert.doesNotMatch(shellAssets, /runtime-config\.js/);
  assert.match(shellAssets, /"assets\/js\/data\.js"/);
  assert.match(shellAssets, /"assets\/js\/catalog-api\.js"/);
  assert.match(shellAssets, /"assets\/js\/main\.js"/);
  assert.match(source, /key\.startsWith\("web00-shell-"\) && key !== WEB00_CACHE/);
  assert.doesNotMatch(source, /caches\.delete\(WEB00_CACHE\)|caches\.delete\(key\)(?!\))/);
  assert.notEqual(runtimeConfigGuard, -1);
  assert.notEqual(originGuard, -1);
  assert.ok(runtimeConfigGuard < firstCacheRead);
  assert.ok(runtimeConfigGuard < firstCacheOpen);
  assert.ok(runtimeConfigGuard < firstCachePut);
  assert.ok(originGuard < firstCacheRead);
  assert.ok(originGuard < firstCacheOpen);
  assert.ok(originGuard < firstCachePut);
});
