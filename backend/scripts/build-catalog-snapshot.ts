import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export interface LegacySolution {
  active: boolean;
  category: string;
  deliveryTime?: string | null;
  demoLocalUrl?: string | null;
  demoMode?: string | null;
  demoUrl?: string | null;
  description: string;
  externalDemoUrl?: string | null;
  features: string[];
  filter: string;
  id: string;
  legacyTitle?: string | null;
  originalDemoUrl?: string | null;
  previewImage?: string | null;
  previewType?: string | null;
  priceFrom?: string | null;
  title: string;
}

export interface LegacyCatalogData {
  galleries: Record<string, string[]>;
  solutions: LegacySolution[];
}

export interface CatalogSnapshotCategory {
  active: boolean;
  description: string | null;
  slug: string;
  sortOrder: number;
  title: string;
}

export interface CatalogSnapshotGalleryImage {
  alt: string;
  sortOrder: number;
  storagePath: string;
  url: string;
}

export interface CatalogSnapshotSite {
  active: boolean;
  categorySlug: string;
  deliveryLabel: string | null;
  demoLocalUrl: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  externalDemoUrl: string | null;
  featured: boolean;
  features: string[];
  fullDescription: string | null;
  galleryImages: CatalogSnapshotGalleryImage[];
  legacyTitle: string | null;
  originalDemoUrl: string | null;
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  publishedAt: string | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  sortOrder: number;
  status: "draft" | "published";
  tags: string[];
  title: string;
  views: number;
}

export interface CatalogSnapshot {
  categories: CatalogSnapshotCategory[];
  generatedAt: string;
  sites: CatalogSnapshotSite[];
  sourceCommit: string;
  sourceFile: "assets/js/data.js";
  sourceRepository: string;
  sourceSha256: string;
}

const categoryOrder = [
  "individual",
  "goods",
  "construction",
  "medicine",
  "services",
  "realty",
  "delivery"
];
const SNAPSHOT_GENERATED_AT = "2026-07-24T00:00:00.000Z";

export function parseLegacyCatalogSource(sourceText: string): LegacyCatalogData {
  const sourceFile = ts.createSourceFile(
    "data.js",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const solutionsNode = findConstInitializer(sourceFile, "SOLUTIONS");
  const galleriesNode = findConstInitializer(sourceFile, "SOLUTION_GALLERIES");
  const solutions = readLiteral(solutionsNode);
  const galleries = readLiteral(galleriesNode);

  if (!Array.isArray(solutions)) {
    throw new Error("SOLUTIONS must be a literal array.");
  }

  return {
    galleries: asGalleryMap(galleries),
    solutions: solutions.map((solution) => asLegacySolution(solution))
  };
}

export function buildCatalogSnapshot(options: {
  sourceCommit: string;
  sourceSha256: string;
  sourceText: string;
}): CatalogSnapshot {
  const legacy = parseLegacyCatalogSource(options.sourceText);
  const categories = buildCategories(legacy.solutions);
  const sites = legacy.solutions.map((solution, index) =>
    buildSite(solution, legacy.galleries[solution.id], (index + 1) * 10)
  );

  return {
    categories,
    generatedAt: SNAPSHOT_GENERATED_AT,
    sites,
    sourceCommit: options.sourceCommit,
    sourceFile: "assets/js/data.js",
    sourceRepository: "https://github.com/Prudexxx/web00-pro.git",
    sourceSha256: options.sourceSha256
  };
}

function findConstInitializer(sourceFile: ts.SourceFile, variableName: string): ts.Expression {
  let found: ts.Expression | undefined;

  function visit(node: ts.Node): void {
    if (found !== undefined) {
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
      found = node.initializer;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (found === undefined) {
    throw new Error(`${variableName} literal declaration was not found.`);
  }

  return found;
}

function readLiteral(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => {
      if (ts.isSpreadElement(element)) {
        throw new Error("Legacy catalog values must be literal.");
      }

      return readLiteral(element);
    });
  }

  if (ts.isObjectLiteralExpression(node)) {
    const output: Record<string, unknown> = {};

    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error("Legacy catalog values must be literal.");
      }

      output[readPropertyName(property.name)] = readLiteral(property.initializer);
    }

    return output;
  }

  throw new Error("Legacy catalog values must be literal.");
}

function readPropertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  throw new Error("Legacy catalog object keys must be literal.");
}

function asGalleryMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    throw new Error("SOLUTION_GALLERIES must be a literal object.");
  }

  const output: Record<string, string[]> = {};

  for (const [key, gallery] of Object.entries(value)) {
    if (!Array.isArray(gallery) || !gallery.every((entry) => typeof entry === "string")) {
      throw new Error(`Gallery ${key} must contain literal image names.`);
    }

    output[key] = gallery;
  }

  return output;
}

function asLegacySolution(value: unknown): LegacySolution {
  if (!isRecord(value)) {
    throw new Error("Legacy solution must be an object.");
  }

  return {
    active: readOptionalBoolean(value, "active") ?? true,
    category: readRequiredString(value, "category"),
    deliveryTime: readOptionalString(value, "deliveryTime"),
    demoLocalUrl: readOptionalString(value, "demoLocalUrl"),
    demoMode: readOptionalString(value, "demoMode"),
    demoUrl: readOptionalString(value, "demoUrl"),
    description: readRequiredString(value, "description"),
    externalDemoUrl: readOptionalString(value, "externalDemoUrl"),
    features: readRequiredStringArray(value, "features"),
    filter: readRequiredString(value, "filter"),
    id: readRequiredString(value, "id"),
    legacyTitle: readOptionalString(value, "legacyTitle"),
    originalDemoUrl: readOptionalString(value, "originalDemoUrl"),
    previewImage: readOptionalString(value, "previewImage"),
    previewType: readOptionalString(value, "previewType"),
    priceFrom: readOptionalString(value, "priceFrom"),
    title: readRequiredString(value, "title")
  };
}

function buildCategories(solutions: LegacySolution[]): CatalogSnapshotCategory[] {
  const categories = new Map<string, CatalogSnapshotCategory>();

  for (const solution of solutions) {
    if (categories.has(solution.filter)) {
      continue;
    }

    const approvedIndex = categoryOrder.indexOf(solution.filter);
    categories.set(solution.filter, {
      active: true,
      description: null,
      slug: solution.filter,
      sortOrder: (approvedIndex >= 0 ? approvedIndex + 1 : categories.size + 1) * 10,
      title: solution.category
    });
  }

  return [...categories.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}

function buildSite(
  solution: LegacySolution,
  gallery: string[] | undefined,
  sortOrder: number
): CatalogSnapshotSite {
  const galleryNames = gallery ?? [];

  return {
    active: solution.active ?? true,
    categorySlug: solution.filter,
    deliveryLabel: solution.deliveryTime ?? null,
    demoLocalUrl: solution.demoLocalUrl ?? null,
    demoMode: solution.demoMode ?? null,
    demoUrl: solution.demoUrl ?? null,
    developmentDays: null,
    externalDemoUrl: solution.externalDemoUrl ?? null,
    featured: false,
    features: [...solution.features],
    fullDescription: null,
    galleryImages: galleryNames.map((name, index) => {
      const fileName = `${name}.png`;

      return {
        alt: solution.title,
        sortOrder: index,
        storagePath: `catalog/sites/${solution.id}/gallery/${basename(fileName)}`,
        url: `assets/img/solution-gallery/${fileName}`
      };
    }),
    legacyTitle: solution.legacyTitle ?? null,
    originalDemoUrl: solution.originalDemoUrl ?? null,
    previewImageUrl: solution.previewImage ?? null,
    previewType: solution.previewType ?? null,
    priceAmountCents: null,
    priceLabel: solution.priceFrom ?? null,
    publishedAt: SNAPSHOT_GENERATED_AT,
    shortDescription: solution.description,
    siteUrl: null,
    slug: solution.id,
    sortOrder,
    status: "published",
    tags: [],
    title: solution.title,
    views: 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];

  if (typeof field !== "string" || field.trim() === "") {
    throw new Error(`${key} must be a literal string.`);
  }

  return field;
}

function readOptionalString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];

  if (field === undefined || field === null) {
    return null;
  }

  if (typeof field !== "string") {
    throw new Error(`${key} must be a literal string or null.`);
  }

  return field;
}

function readOptionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== "boolean") {
    throw new Error(`${key} must be a literal boolean.`);
  }

  return field;
}

function readRequiredStringArray(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];

  if (!Array.isArray(field) || !field.every((entry) => typeof entry === "string")) {
    throw new Error(`${key} must be a literal string array.`);
  }

  return field;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readSourceCommit(repositoryRoot: string): string {
  return execFileSync("git", ["-C", repositoryRoot, "log", "-1", "--format=%H", "--", "assets/js/data.js"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function main(): void {
  const backendRoot = process.cwd();
  const repositoryRoot = resolve(backendRoot, "..");
  const sourcePath = join(repositoryRoot, "assets", "js", "data.js");
  const outputPath = join(backendRoot, "prisma", "seed-data", "web00-catalog.json");

  if (!existsSync(sourcePath)) {
    throw new Error("Legacy data source was not found.");
  }

  const sourceText = readFileSync(sourcePath, "utf8");
  const snapshot = buildCatalogSnapshot({
    sourceCommit: readSourceCommit(repositoryRoot),
    sourceSha256: sha256(sourceText),
    sourceText
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  WriteSafeSummary(snapshot);
}

function WriteSafeSummary(snapshot: CatalogSnapshot): void {
  process.stdout.write(
    `snapshot built: categories=${snapshot.categories.length} sites=${snapshot.sites.length}\n`
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath !== "" && fileURLToPath(import.meta.url) === entryPath) {
  main();
}
