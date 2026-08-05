#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const DEFAULT_PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_CARDS_DIR = "catalog/cards";
const DEFAULT_DATA_JS = "assets/js/data.js";
const GENERATED_START = "  // BEGIN GENERATED SOLUTIONS";
const GENERATED_END = "  // END GENERATED SOLUTIONS";
const SAFE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATIVE_URL_RE = /^[a-z0-9][a-z0-9/_.,+@%=-]*(?:#[a-z0-9._%=-]+)?$/i;

export async function buildPagesCatalog(options = {}) {
  const projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;
  const cardsDir = resolveProjectPath(projectRoot, options.cardsDir || DEFAULT_CARDS_DIR);
  const dataTemplatePath = resolveProjectPath(projectRoot, options.dataTemplatePath || DEFAULT_DATA_JS);
  const cards = await loadCanonicalCards(cardsDir);
  const dataJs = renderDataJs({
    cards,
    template: await readFile(dataTemplatePath, "utf8"),
  });

  return {
    cards,
    dataJs,
    sha256: sha256(dataJs),
  };
}

export async function writePagesCatalog(options = {}) {
  const projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;
  const outputPath = resolveProjectPath(projectRoot, options.outputPath || DEFAULT_DATA_JS);
  const result = await buildPagesCatalog({
    ...options,
    projectRoot,
    dataTemplatePath: options.dataTemplatePath || outputPath,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.dataJs, "utf8");
  return result;
}

export async function loadCanonicalCards(cardsDir) {
  const entries = await readdir(cardsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (files.length === 0) {
    throw new Error("No catalog card JSON files found.");
  }

  const cards = [];
  for (const file of files) {
    const filePath = join(cardsDir, file);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const fileId = basename(file, ".json");
    cards.push(normalizeCard(parsed, { fileId, filePath }));
  }

  validateUnique(cards, "id");
  validateUnique(cards, "slug");

  return cards.sort(compareCards);
}

export function renderDataJs({ cards, template }) {
  const solutions = cards.map(cardToDataJsSolution);
  const block = renderSolutionsBlock({
    galleries: buildLegacyGalleryMap(solutions),
    solutions,
  });
  const generatedBlock = /  \/\/ BEGIN GENERATED SOLUTIONS[\s\S]*?  \/\/ END GENERATED SOLUTIONS\r?\n\r?\n*/;
  if (generatedBlock.test(template)) {
    return template.replace(generatedBlock, block);
  }

  const legacyBlock = /  const SOLUTIONS = \[[\s\S]*?  SOLUTIONS\.forEach\(\(solution\) => \{[\s\S]*?  \}\);\r?\n\r?\n(?=  const SERVICES = \[)/;
  if (!legacyBlock.test(template)) {
    throw new Error("Unable to locate SOLUTIONS block in assets/js/data.js template.");
  }
  return template.replace(legacyBlock, block);
}

export function buildPagesCatalogFromCards(cards, options = {}) {
  const normalized = cards.map((card, index) => normalizeCard(card, {
    fileId: card.id,
    filePath: `synthetic-card-${index + 1}.json`,
  }));
  validateUnique(normalized, "id");
  validateUnique(normalized, "slug");
  const sorted = normalized.sort(compareCards);
  const template = options.template || minimalDataTemplate();
  const dataJs = renderDataJs({ cards: sorted, template });
  return {
    cards: sorted,
    dataJs,
    sha256: sha256(dataJs),
  };
}

function normalizeCard(input, context) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Catalog card must be a JSON object: ${context.filePath}`);
  }

  const id = text(input.id);
  const slug = text(input.slug || input.id);
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid catalog card id in ${context.filePath}.`);
  }
  if (id !== context.fileId) {
    throw new Error(`Catalog card id must match filename in ${context.filePath}.`);
  }
  if (!SAFE_ID_RE.test(slug)) {
    throw new Error(`Invalid catalog card slug in ${context.filePath}.`);
  }

  const card = orderedObject({
    id,
    slug,
    sortOrder: finiteNumber(input.sortOrder, Number.MAX_SAFE_INTEGER),
    legacyTitle: optionalText(input.legacyTitle),
    title: requiredText(input.title, "title", context),
    editableTitle: input.editableTitle === true,
    category: requiredText(input.category, "category", context),
    description: requiredText(input.description, "description", context),
    priceFrom: optionalText(input.priceFrom || input.price),
    deliveryTime: optionalText(input.deliveryTime || input.delivery),
    features: normalizeTextArray(input.features || input.includes, "features", context),
    tags: normalizeTextArray(input.tags, "tags", context),
    previewImage: validateUrl(input.previewImage, { field: "previewImage", context, required: true }),
    previewType: optionalText(input.previewType),
    filter: optionalText(input.filter),
    demoMode: optionalText(input.demoMode),
    demoLocalUrl: validateNullableUrl(input.demoLocalUrl, { field: "demoLocalUrl", context, allowRelative: true }),
    externalDemoUrl: validateNullableUrl(input.externalDemoUrl, { field: "externalDemoUrl", context, allowRelative: false }),
    originalDemoUrl: validateNullableUrl(input.originalDemoUrl, { field: "originalDemoUrl", context, allowRelative: false }),
    demoUrl: validateNullableUrl(input.demoUrl, { field: "demoUrl", context, allowRelative: true }),
    siteUrl: validateNullableUrl(input.siteUrl, { field: "siteUrl", context, allowRelative: false }),
    galleryImages: normalizeGallery(input.galleryImages, context),
    aliases: normalizeAliases(input.aliases, id),
    active: input.active !== false,
  });

  if (card.galleryImages.length === 0) {
    card.galleryImages = [card.previewImage];
  }
  return card;
}

function cardToDataJsSolution(card) {
  return orderedObject({
    id: card.id,
    slug: card.slug,
    sortOrder: card.sortOrder,
    legacyTitle: card.legacyTitle,
    title: card.title,
    editableTitle: card.editableTitle,
    category: card.category,
    description: card.description,
    priceFrom: card.priceFrom,
    deliveryTime: card.deliveryTime,
    features: card.features,
    tags: card.tags,
    previewImage: card.previewImage,
    previewType: card.previewType,
    filter: card.filter,
    demoMode: card.demoMode,
    demoLocalUrl: card.demoLocalUrl,
    externalDemoUrl: card.externalDemoUrl,
    originalDemoUrl: card.originalDemoUrl,
    demoUrl: card.demoUrl,
    siteUrl: card.siteUrl,
    galleryImages: card.galleryImages,
    aliases: card.aliases,
    active: card.active,
  });
}

function renderSolutionsBlock({ galleries, solutions }) {
  const literal = JSON.stringify(solutions, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");
  const galleryLiteral = JSON.stringify(galleries, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `  ${line}`)
    .join("\n");
  return `${GENERATED_START}\n  const SOLUTIONS = ${literal};\n\n  const SOLUTION_GALLERIES = ${galleryLiteral};\n${GENERATED_END}\n\n`;
}

function compareCards(left, right) {
  const order = left.sortOrder - right.sortOrder;
  if (order !== 0) return order;
  return left.slug.localeCompare(right.slug, "en");
}

function validateUnique(cards, field) {
  const seen = new Map();
  for (const card of cards) {
    const value = card[field];
    if (seen.has(value)) {
      throw new Error(`Duplicate catalog card ${field}: ${value}`);
    }
    seen.set(value, card.id);
  }
}

function normalizeGallery(value, context) {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => validateUrl(entry, {
    field: `galleryImages[${index}]`,
    context,
    required: true,
  }));
}

function normalizeAliases(value, id) {
  return [...new Set([
    id,
    ...normalizeTextArray(value, "aliases", { filePath: id }),
  ].filter(Boolean))];
}

function buildLegacyGalleryMap(solutions) {
  return Object.fromEntries(solutions.map((solution) => [
    solution.id,
    solution.galleryImages.map((image) => legacyGalleryName(image)).filter(Boolean),
  ]));
}

function legacyGalleryName(value) {
  const raw = text(value);
  const prefix = "assets/img/solution-gallery/";
  if (raw.startsWith(prefix) && raw.endsWith(".png")) {
    return raw.slice(prefix.length, -".png".length);
  }
  try {
    const parsed = new URL(raw);
    const filename = parsed.pathname.split("/").pop() || "";
    return filename.endsWith(".png") ? filename.slice(0, -".png".length) : "";
  } catch {
    return "";
  }
}

function normalizeTextArray(value, field, context) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Catalog card ${field} must be an array in ${context.filePath}.`);
  }
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

function validateNullableUrl(value, options) {
  if (value === undefined || value === null || value === "") return value === null ? null : "";
  return validateUrl(value, { ...options, required: false });
}

function validateUrl(value, { field, context, required, allowRelative = true }) {
  const raw = text(value);
  if (!raw) {
    if (required) throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
    return "";
  }
  const decodedRaw = repeatedlyDecode(raw);
  if (/[\u0000-\u001f\u007f]/.test(raw) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decodedRaw)) {
    throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
    }
    const decodedPath = repeatedlyDecode(parsed.pathname);
    const hostname = parsed.hostname.replace(/\.+$/, "");
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      hostname.endsWith(".invalid") ||
      decodedPath.split("/").includes("..")
    ) {
      throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
    }
    return parsed.href;
  }
  if (!allowRelative || raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || !RELATIVE_URL_RE.test(raw)) {
    throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
  }
  const decoded = repeatedlyDecode(raw);
  const segments = decoded.split(/[/?#]/)[0].split("/");
  if (segments.includes("..") || decoded.includes("../") || decoded.includes("..\\")) {
    throw new Error(`Invalid catalog card URL ${field} in ${context.filePath}.`);
  }
  return raw;
}

function repeatedlyDecode(value) {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

function orderedObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requiredText(value, field, context) {
  const result = text(value);
  if (!result) throw new Error(`Catalog card ${field} is required in ${context.filePath}.`);
  return result;
}

function optionalText(value) {
  const result = text(value);
  return result || undefined;
}

function text(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resolveProjectPath(projectRoot, path) {
  return isAbsolute(path) ? path : join(projectRoot, path);
}

function minimalDataTemplate() {
  return `(function () {\n${GENERATED_START}\n  const SOLUTIONS = [];\n${GENERATED_END}\n\n  window.WEB00_DATA = { SOLUTIONS };\n})();\n`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    const result = await buildPagesCatalog();
    const current = await readFile(join(DEFAULT_PROJECT_ROOT, DEFAULT_DATA_JS), "utf8");
    if (current !== result.dataJs) {
      throw new Error("assets/js/data.js is not up to date. Run scripts/build-pages-catalog.mjs.");
    }
    console.log(`Pages catalog OK: ${result.cards.length} cards, sha256=${result.sha256}`);
    return;
  }
  const result = await writePagesCatalog();
  console.log(`Pages catalog generated: ${result.cards.length} cards, sha256=${result.sha256}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
