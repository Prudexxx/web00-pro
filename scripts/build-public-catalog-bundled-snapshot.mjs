import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, "assets", "js", "data.js");
const ARTIFACT_PATH = path.join(ROOT, "assets", "js", "public-catalog-bundled-snapshot.js");
const REVISION = 1;
const GENERATED_AT = "2026-08-03T00:00:00.000Z";
const POPULAR_SLUGS = Object.freeze(["mebel", "medicina", "doma-bani"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeArray(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    const key = normalized.toLocaleLowerCase("ru-RU");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function publicImage(url, title) {
  const safeUrl = text(url);
  return safeUrl ? { alt: title, url: safeUrl, variants: [] } : null;
}

function legacySolutionToPublicItem(solution) {
  const slug = text(solution.id);
  const title = text(solution.title);
  const previewImage = publicImage(solution.previewImage, title);
  const galleryImages = (Array.isArray(solution.galleryImages) ? solution.galleryImages : [])
    .map((url) => publicImage(url, title))
    .filter(Boolean);

  return {
    category: {
      slug: text(solution.filter) || text(solution.previewType) || "services",
      title: text(solution.category),
    },
    deliveryLabel: text(solution.deliveryTime),
    demoMode: text(solution.demoMode),
    demoUrl: text(solution.demoUrl),
    features: normalizeArray(solution.features || solution.includes),
    galleryImages,
    previewImage,
    previewImageUrl: previewImage ? previewImage.url : null,
    priceLabel: text(solution.priceFrom),
    shortDescription: text(solution.description),
    siteUrl: null,
    slug,
    tags: normalizeArray(solution.tags),
    title,
  };
}

function domDlyaBusiPublicItem() {
  return {
    category: {
      slug: "business",
      title: "Business",
    },
    deliveryLabel: "14 days",
    demoMode: "",
    demoUrl: null,
    features: ["CRM"],
    galleryImages: [],
    previewImage: null,
    previewImageUrl: null,
    priceLabel: "from 1200",
    shortDescription: "Short description",
    siteUrl: null,
    slug: "dom-dlya-busi",
    tags: ["crm"],
    title: "Дом для Буси",
  };
}

async function readLegacySolutions() {
  const source = await readFile(DATA_PATH, "utf8");
  const sandbox = {
    window: {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: DATA_PATH });
  const solutions = sandbox.window.WEB00_DATA && sandbox.window.WEB00_DATA.SOLUTIONS;
  if (!Array.isArray(solutions)) {
    throw new Error("WEB00_DATA.SOLUTIONS was not found");
  }
  return solutions;
}

function stableStringify(value, space = 2) {
  return JSON.stringify(sortKeys(value), null, space);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
}

function buildArtifactSource(snapshot) {
  return `(function () {
  "use strict";

  window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT = Object.freeze(${stableStringify(snapshot, 2)});
})();
`;
}

async function buildSnapshot() {
  const legacySolutions = await readLegacySolutions();
  const legacyItems = legacySolutions
    .filter((solution) => solution && solution.active !== false)
    .map(legacySolutionToPublicItem);
  const items = [...legacyItems, domDlyaBusiPublicItem()];
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const popular = POPULAR_SLUGS.map((slug) => {
    const item = bySlug.get(slug);
    if (!item) throw new Error(`Missing bundled popular item: ${slug}`);
    return item;
  });

  return {
    generatedAt: GENERATED_AT,
    items,
    itemsCount: items.length,
    popular,
    revision: REVISION,
    schemaVersion: 1,
    settings: {
      showDemoInModal: false,
    },
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const snapshot = await buildSnapshot();
  const source = buildArtifactSource(snapshot);

  if (check) {
    let existing = "";
    try {
      existing = await readFile(ARTIFACT_PATH, "utf8");
    } catch (_) {
      existing = "";
    }
    if (existing !== source) {
      console.error("bundled public catalog snapshot: artifact is not up to date");
      process.exitCode = 1;
      return;
    }
    console.log(`bundled public catalog snapshot: PASS revision=${snapshot.revision} items=${snapshot.itemsCount} popular=${snapshot.popular.length}`);
    return;
  }

  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await writeFile(ARTIFACT_PATH, source, "utf8");
  console.log(`bundled public catalog snapshot: wrote revision=${snapshot.revision} items=${snapshot.itemsCount} popular=${snapshot.popular.length}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
