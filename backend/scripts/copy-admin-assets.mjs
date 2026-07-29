import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredFiles = [
  "index.html",
  "assets/admin.css",
  "assets/main.js"
];

export function resolveAdminUiAssetRoots(moduleUrl = import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(moduleUrl));
  const backendRoot = path.resolve(scriptDir, "..");

  return {
    destinationDir: path.join(backendRoot, "dist", "admin"),
    sourceDir: path.join(backendRoot, "src", "admin")
  };
}

export async function copyAdminAssets(options = {}) {
  const roots = {
    ...resolveAdminUiAssetRoots(),
    ...options
  };
  const sourceDir = path.resolve(roots.sourceDir);
  const destinationDir = path.resolve(roots.destinationDir);

  assertDestinationInsideDist(destinationDir);
  await assertDirectory(sourceDir, "Missing Admin UI source directory.");
  await verifyRequiredFiles(sourceDir, "source");
  await rm(destinationDir, { force: true, recursive: true });
  await mkdir(destinationDir, { recursive: true });
  await cp(sourceDir, destinationDir, { recursive: true });
  await verifyRequiredFiles(destinationDir, "output");

  return {
    destinationDir,
    requiredFiles: [...requiredFiles],
    sourceDir
  };
}

function assertDestinationInsideDist(destinationDir) {
  const parent = path.dirname(destinationDir);

  if (path.basename(parent) !== "dist") {
    throw new Error("Admin UI destination must stay inside backend/dist.");
  }
  if (!destinationDir.startsWith(parent + path.sep)) {
    throw new Error("Admin UI destination must stay inside backend/dist.");
  }
}

async function assertDirectory(directory, message) {
  try {
    const stats = await stat(directory);

    if (!stats.isDirectory()) {
      throw new Error(message);
    }
  } catch {
    throw new Error(message);
  }
}

async function verifyRequiredFiles(rootDir, phase) {
  for (const file of requiredFiles) {
    const fullPath = path.join(rootDir, file);

    try {
      const stats = await stat(fullPath);

      if (!stats.isFile()) {
        throw new Error("not a file");
      }
    } catch {
      throw new Error(`Missing required Admin UI ${phase} asset: ${file}`);
    }
  }
}

if (isDirectRun()) {
  try {
    await copyAdminAssets();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Admin UI asset copy failure.";

    console.error(`Admin UI asset copy failed: ${message}`);
    process.exitCode = 1;
  }
}

function isDirectRun() {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
