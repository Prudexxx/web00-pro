import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MAIN_URL = new URL("../../assets/js/catalog-v2/main.js", import.meta.url);

test("external HTTPS demo policy permits safe cross-origin iframe only when modal setting is ON", async () => {
  const source = await readFile(MAIN_URL, "utf8");

  assert.match(source, /function isSafeExternalDemoUrl\(url\)/);
  assert.match(source, /parsed\.protocol === "https:"/);
  assert.match(source, /parsed\.username === ""/);
  assert.match(source, /parsed\.password === ""/);
  assert.doesNotMatch(source, /parsed\.origin === window\.location\.origin/);
  assert.match(
    source,
    /const showExternalDemoInside = isExternalDemo &&\s+catalogShowDemoInModal\(\) &&\s+Boolean\(demoUrl\) &&\s+isSafeExternalDemoUrl\(demoUrl\);/
  );
});

test("external demo URL guard accepts only credential-free HTTPS", async () => {
  const source = await readFile(MAIN_URL, "utf8");
  const match = source.match(/function isSafeExternalDemoUrl\(url\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "expected isSafeExternalDemoUrl helper");

  const isSafeExternalDemoUrl = new Function(
    "URL",
    `return function isSafeExternalDemoUrl(url) {${match[1]}\n  }`
  )(URL);

  assert.equal(isSafeExternalDemoUrl("https://spasilen.com/"), true);
  assert.equal(isSafeExternalDemoUrl("https://example.com/demo"), true);
  assert.equal(isSafeExternalDemoUrl("http://spasilen.com/"), false);
  assert.equal(isSafeExternalDemoUrl("https://user:pass@spasilen.com/"), false);
  assert.equal(isSafeExternalDemoUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalDemoUrl("data:text/html,test"), false);
  assert.equal(isSafeExternalDemoUrl("ftp://spasilen.com/"), false);
  assert.equal(isSafeExternalDemoUrl("not a url"), false);
});

test("external demo iframe stays gated by the admin setting and keeps separate-open fallback", async () => {
  const source = await readFile(MAIN_URL, "utf8");

  assert.match(
    source,
    /const showExternalDemoInside = isExternalDemo &&\s+catalogShowDemoInModal\(\) &&\s+Boolean\(demoUrl\) &&\s+isSafeExternalDemoUrl\(demoUrl\);/
  );
  assert.match(
    source,
    /const externalFallbackOnly = isExternalDemo && !showExternalDemoInside;/
  );
  assert.match(
    source,
    /externalLink\(originalDemoUrl, isExternalDemo \? "Открыть отдельно" : "Открыть оригинал"\)/
  );
});
