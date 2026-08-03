import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helperDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(helperDir, "../../..");

function toRelative(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function expandPattern(pattern) {
  if (!pattern.includes("*")) {
    const absolute = resolve(repoRoot, pattern);
    return existsSync(absolute) ? [toRelative(absolute)] : [];
  }

  const [directoryPart, filePattern] = pattern.split(/(?=[^/]*\*)/);
  const directory = resolve(repoRoot, directoryPart);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return [];
  }

  const regex = new RegExp(`^${filePattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`);
  return readdirSync(directory)
    .filter((entry) => regex.test(entry))
    .map((entry) => toRelative(join(directory, entry)));
}

export async function collectProductionV2Files(patterns) {
  const found = [];
  const missing = [];

  for (const pattern of patterns) {
    const matches = expandPattern(pattern);
    if (matches.length === 0) {
      missing.push(pattern);
    }
    found.push(...matches);
  }

  if (missing.length > 0) {
    throw new Error(`PUBLIC_CATALOG_V2_PRODUCTION_FILE_MISSING: ${missing.join(", ")}`);
  }

  return [...new Set(found)].sort();
}

export async function buildProductionImportGraph(files) {
  const graph = new Map();
  for (const relativePath of files) {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    graph.set(relativePath, collectImportSpecifiers(source));
  }
  return graph;
}

export async function parseProductionModuleAst(relativePath) {
  return {
    relativePath,
    source: readFileSync(resolve(repoRoot, relativePath), "utf8")
  };
}

export function assertNoDataJsImport(importGraph, relativePath) {
  const imports = importGraph.get(relativePath) ?? [];
  if (imports.some((specifier) => specifier.includes("data.js"))) {
    throw new Error(`PUBLIC_CATALOG_V2_DATA_JS_IMPORT_FORBIDDEN: ${relativePath}`);
  }
}

export function assertNoFixtureImport(importGraph, relativePath) {
  const imports = importGraph.get(relativePath) ?? [];
  if (imports.some((specifier) => /fixture|synthetic|test/i.test(specifier))) {
    throw new Error(`PUBLIC_CATALOG_V2_FIXTURE_IMPORT_FORBIDDEN: ${relativePath}`);
  }
}

export function assertNoCardObjectConstruction(ast) {
  if (
    /\b(domDlyaBusiPublicItem|hardcodedProductionCards|productionCards|productionCatalogItems)\b/.test(ast.source) ||
    /\b(?:const|let|var)\s+\w*(?:cards|items|catalog|solutions)\w*\s*=\s*\[[\s\S]*?\{[\s\S]*?["']?slug["']?\s*:/i.test(ast.source) ||
    /\breturn\s+\[[\s\S]*?\{[\s\S]*?["']?slug["']?\s*:/i.test(ast.source)
  ) {
    throw new Error(`PUBLIC_CATALOG_V2_CARD_OBJECT_CONSTRUCTION_FORBIDDEN: ${ast.relativePath}`);
  }
}

export function assertNoManualProductionItemConstruction(ast) {
  if (
    /\.(push|unshift|splice)\s*\(\s*\{[^}]*["']?slug["']?\s*:/s.test(ast.source) ||
    /\b(?:map|concat)\s*\([^)]*=>\s*\(?\s*\{[^}]*["']?slug["']?\s*:\s*["'][a-z0-9-]+["']/is.test(ast.source)
  ) {
    throw new Error(`PUBLIC_CATALOG_V2_MANUAL_ITEM_CONSTRUCTION_FORBIDDEN: ${ast.relativePath}`);
  }
}

export function assertNoSlugTitleSwitchOrMap(ast) {
  if (/\b(specialCaseBySlug|specialCaseByTitle)\b|switch\s*\([^)]*(slug|title)/.test(ast.source)) {
    throw new Error(`PUBLIC_CATALOG_V2_SLUG_TITLE_SPECIAL_CASE_FORBIDDEN: ${ast.relativePath}`);
  }
}

export function assertNoJsonStringCardPayload(ast) {
  if (/"items"\s*:\s*\[[\s\S]*"slug"\s*:/.test(ast.source)) {
    throw new Error(`PUBLIC_CATALOG_V2_JSON_STRING_CARD_PAYLOAD_FORBIDDEN: ${ast.relativePath}`);
  }
}

export function assertNoLegacyReleaseMerge(ast) {
  if (/WEB00_DATA|legacy.*release|release.*legacy|merge.*legacy|legacy.*merge/i.test(ast.source)) {
    throw new Error(`PUBLIC_CATALOG_V2_LEGACY_RELEASE_MERGE_FORBIDDEN: ${ast.relativePath}`);
  }
}

export async function loadV2ManifestChunkChainVerifier() {
  const clientUrl = pathToFileURL(resolve(repoRoot, "assets/js/public-catalog-v2-client.js")).href;
  let module;
  try {
    module = await import(clientUrl);
  } catch (error) {
    throw new Error("Expected Public Catalog V2 provenance verifier module to exist; OPV2-1 is RED until V2 frontend provenance checks are implemented.", { cause: error });
  }

  if (typeof module.verifyV2ManifestChunkChain !== "function") {
    throw new Error("Expected Public Catalog V2 provenance verifier function to exist; OPV2-1 is RED until V2 frontend provenance checks are implemented.");
  }

  return module.verifyV2ManifestChunkChain;
}

export async function verifyV2ManifestChunkChain(candidate) {
  const verifier = await loadV2ManifestChunkChainVerifier();
  return verifier(candidate);
}

function collectImportSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /\bimportScripts\s*\(\s*["']([^"']+)["']/g,
    /\b(?:src|href)\s*=\s*["']([^"']*data\.js[^"']*)["']/g,
    /["'`]([^"'`]*data\.js[^"'`]*)["'`]/g
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}
