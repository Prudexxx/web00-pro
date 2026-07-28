import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_SRC = path.join(process.cwd(), "src", "admin");

describe("admin UI final security audit", () => {
  it("keeps production admin sources free of unsafe DOM and persistence APIs", () => {
    const combined = readAdminSources().map((file) => file.source).join("\n");

    expect(combined).not.toMatch(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|eval\s*\(|new Function|document\.write/);
    expect(combined).not.toMatch(/setAttribute\(["'`]on[a-z]+|["'`]\s*on[a-z]+\s*=/i);
    expect(combined).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|document\.cookie/);
    expect(combined).not.toMatch(/console\.(log|warn|error)[^\n]*(token|password)|(token|password)[^\n]*console\.(log|warn|error)/i);
    expect(combined).not.toMatch(/@supabase\/supabase-js|createClient\s*\(/);
  });

  it("keeps index HTML externalized with no inline script, style, CDN, or forbidden navigation URLs", () => {
    const html = readFileSync(path.join(ADMIN_SRC, "index.html"), "utf8");

    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style\b|style\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/https?:\/\/|javascript:|data:/i);
    expect(html).toContain('<script type="module" src="/admin/assets/main.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/admin/assets/admin.css">');
    expect(html).toContain("<noscript>");
  });

  it("does not introduce absolute API origins, external imports, public bug-report surfaces, or superseded admin routes", () => {
    const combined = readAdminSources().map((file) => file.source).join("\n");
    const users = readFileSync(path.join(ADMIN_SRC, "assets", "screens", "users.js"), "utf8");
    const audit = readFileSync(path.join(ADMIN_SRC, "assets", "screens", "audit.js"), "utf8");

    expect(combined).not.toMatch(/https?:\/\/[^"')\s]+\/api\//);
    expect(combined).not.toMatch(/from\s+["'`]https?:\/\/|import\s*\(["'`]https?:\/\//);
    expect(combined).not.toMatch(/bug report|bug-report|report bug|сообщить об ошибке|ошибка на сайте/i);
    expect(users).not.toMatch(/reset-password|registration|invite|sessions?\/revoke|create-user|delete-user/i);
    expect(users).not.toMatch(/\/api\/admin\/users["'`][\s\S]{0,120}method:\s*["'`]POST/i);
    expect(users).not.toMatch(/\/api\/admin\/users\/[^"'`]+\/password/i);
    expect(audit).not.toMatch(/method:\s*["'`](POST|PATCH|DELETE)["'`]/);
  });

  it("keeps multipart uploads free of manual Content-Type and automatic replay", () => {
    const apiClient = readFileSync(path.join(ADMIN_SRC, "assets", "api-client.js"), "utf8");
    const imageManager = readFileSync(path.join(ADMIN_SRC, "assets", "screens", "image-manager.js"), "utf8");
    const multipartBlock = apiClient.slice(
      apiClient.indexOf("function toMultipartFetchOptions"),
      apiClient.indexOf("async function readResponseBody")
    );

    expect(multipartBlock).not.toContain("Content-Type");
    expect(imageManager).not.toContain("Content-Type");
    expect(apiClient).not.toMatch(/requestMultipart\([^)]*,\s*true/);
    expect(multipartBlock).not.toMatch(/\breplayed\b/);
  });
});

function readAdminSources() {
  return walkFiles(ADMIN_SRC)
    .filter((filePath) => /\.(?:html|css|js)$/.test(filePath))
    .map((filePath) => ({
      filePath,
      source: readFileSync(filePath, "utf8")
    }));
}

function walkFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) {
      files.push(...walkFiles(filePath));
    } else {
      files.push(filePath);
    }
  }

  return files;
}
