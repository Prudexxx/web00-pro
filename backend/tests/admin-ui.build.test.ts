import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempRoots = new Set<string>();

interface CopyAdminAssetsModule {
  copyAdminAssets(options?: {
    destinationDir?: string;
    sourceDir?: string;
  }): Promise<{ destinationDir: string; requiredFiles: string[]; sourceDir: string }>;
  resolveAdminUiAssetRoots(moduleUrl?: string): {
    destinationDir: string;
    sourceDir: string;
  };
}

describe("admin UI asset copy script", () => {
  afterEach(async () => {
    await Promise.all([...tempRoots].map((root) => rm(root, { force: true, recursive: true })));
    tempRoots.clear();
  });

  it("removes stale destination output and copies required Admin UI assets", async () => {
    const { destinationDir, sourceDir } = await createAdminAssetFixture("copy");
    const module = await loadCopyScript();

    await mkdir(path.join(destinationDir, "assets"), { recursive: true });
    await writeFile(path.join(destinationDir, "assets", "stale.js"), "stale");

    const result = await module.copyAdminAssets({ destinationDir, sourceDir });

    expect(result.requiredFiles).toEqual([
      "index.html",
      "assets/admin.css",
      "assets/main.js"
    ]);
    await expect(readFile(path.join(destinationDir, "index.html"), "utf8")).resolves.toContain(
      '<div id="admin-root">'
    );
    await expect(readFile(path.join(destinationDir, "assets", "admin.css"), "utf8")).resolves.toContain(
      "font-family"
    );
    await expect(readFile(path.join(destinationDir, "assets", "main.js"), "utf8")).resolves.toContain(
      "createElement"
    );
    await expect(readFile(path.join(destinationDir, "assets", "stale.js"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects destinations outside backend/dist", async () => {
    const { root, sourceDir } = await createAdminAssetFixture("outside-dist");
    const module = await loadCopyScript();

    await expect(
      module.copyAdminAssets({
        destinationDir: path.join(root, "not-dist", "admin"),
        sourceDir
      })
    ).rejects.toThrow("Admin UI destination must stay inside backend/dist.");
  });

  it("fails with a controlled error when a required source asset is missing", async () => {
    const { sourceDir, destinationDir } = await createAdminAssetFixture("missing-main");
    const module = await loadCopyScript();

    await rm(path.join(sourceDir, "assets", "main.js"));

    await expect(module.copyAdminAssets({ destinationDir, sourceDir })).rejects.toThrow(
      "Missing required Admin UI source asset: assets/main.js"
    );
  });

  it("resolves source and destination from import.meta.url instead of process.cwd", async () => {
    const module = await loadCopyScript();
    const roots = module.resolveAdminUiAssetRoots(
      pathToFileURL(path.join(process.cwd(), "scripts", "copy-admin-assets.mjs")).href
    );

    expect(roots.sourceDir).toBe(path.join(process.cwd(), "src", "admin"));
    expect(roots.destinationDir).toBe(path.join(process.cwd(), "dist", "admin"));
  });

  it("runs from an unrelated current working directory", async () => {
    const module = await loadCopyScript();
    const { destinationDir } = module.resolveAdminUiAssetRoots();
    const scriptPath = path.join(process.cwd(), "scripts", "copy-admin-assets.mjs");

    await execFileAsync(process.execPath, [scriptPath], {
      cwd: path.parse(process.cwd()).root
    });

    await expect(stat(path.join(destinationDir, "index.html"))).resolves.toMatchObject({
      isFile: expect.any(Function)
    });
  });

  it("does not copy static secrets or environment values into production assets", async () => {
    const { destinationDir, sourceDir } = await createAdminAssetFixture("secret-scan");
    const module = await loadCopyScript();

    await module.copyAdminAssets({ destinationDir, sourceDir });

    const copiedText = [
      await readFile(path.join(destinationDir, "index.html"), "utf8"),
      await readFile(path.join(destinationDir, "assets", "admin.css"), "utf8"),
      await readFile(path.join(destinationDir, "assets", "main.js"), "utf8")
    ].join("\n");

    expect(copiedText).not.toMatch(
      /SUPABASE|SERVICE_ROLE|DATABASE_URL|JWT_|AUTH_|STORAGE_|sb_secret_|token|key/i
    );
  });
});

async function createAdminAssetFixture(name: string): Promise<{
  destinationDir: string;
  root: string;
  sourceDir: string;
}> {
  const root = path.join(process.cwd(), ".tmp", `admin-ui-build-${name}`);
  const sourceDir = path.join(root, "src", "admin");
  const destinationDir = path.join(root, "dist", "admin");

  tempRoots.add(root);
  await rm(root, { force: true, recursive: true });
  await mkdir(path.join(sourceDir, "assets"), { recursive: true });
  await writeFile(
    path.join(sourceDir, "index.html"),
    '<!doctype html><html lang="ru"><body><div id="admin-root"></div></body></html>'
  );
  await writeFile(
    path.join(sourceDir, "assets", "admin.css"),
    "body{font-family:system-ui,sans-serif}"
  );
  await writeFile(
    path.join(sourceDir, "assets", "main.js"),
    'document.body.append(document.createElement("span"));'
  );

  return { destinationDir, root, sourceDir };
}

async function loadCopyScript(): Promise<CopyAdminAssetsModule> {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), "scripts", "copy-admin-assets.mjs")
  ).href;

  return await import(moduleUrl) as CopyAdminAssetsModule;
}
