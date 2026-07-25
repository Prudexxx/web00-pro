import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  status: "draft";
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

export function validateCatalogSnapshot(
  snapshot: CatalogSnapshot,
  options: {
    expectedCategories?: number;
    expectedSites?: number;
    repositoryRoot: string;
    sourceSha256: string;
  }
): string[] {
  const issues: string[] = [];

  if (snapshot.sourceRepository !== "https://github.com/Prudexxx/web00-pro.git") {
    issues.push("sourceRepository is invalid.");
  }
  if (snapshot.sourceFile !== "assets/js/data.js") {
    issues.push("sourceFile is invalid.");
  }
  if (snapshot.sourceSha256 !== options.sourceSha256) {
    issues.push("sourceSha256 does not match legacy source.");
  }
  if (options.expectedCategories !== undefined && snapshot.categories.length !== options.expectedCategories) {
    issues.push(`Expected ${options.expectedCategories} categories.`);
  }
  if (options.expectedSites !== undefined && snapshot.sites.length !== options.expectedSites) {
    issues.push(`Expected ${options.expectedSites} sites.`);
  }

  validateCategories(snapshot, issues);
  validateSites(snapshot, options.repositoryRoot, issues);

  return issues;
}

function validateCategories(snapshot: CatalogSnapshot, issues: string[]): void {
  const categorySlugs = new Set<string>();

  for (const category of snapshot.categories) {
    if (category.slug.trim() === "") {
      issues.push("Category is missing slug.");
    }
    if (category.title.trim() === "") {
      issues.push(`Category ${category.slug} is missing title.`);
    }
    if (categorySlugs.has(category.slug)) {
      issues.push(`Duplicate category slug: ${category.slug}.`);
    }
    categorySlugs.add(category.slug);
  }
}

function validateSites(snapshot: CatalogSnapshot, repositoryRoot: string, issues: string[]): void {
  const categorySlugs = new Set(snapshot.categories.map((category) => category.slug));
  const siteSlugs = new Set<string>();

  for (const site of snapshot.sites) {
    if (site.slug.trim() === "") {
      issues.push("Site is missing slug.");
    }
    if (site.title.trim() === "") {
      issues.push(`Site ${site.slug} is missing title.`);
    }
    if (site.shortDescription.trim() === "") {
      issues.push(`Site ${site.slug} is missing shortDescription.`);
    }
    if (!categorySlugs.has(site.categorySlug)) {
      issues.push(`Site ${site.slug} has unknown categorySlug.`);
    }
    if (siteSlugs.has(site.slug)) {
      issues.push(`Duplicate site slug: ${site.slug}.`);
    }
    siteSlugs.add(site.slug);

    if (site.previewImageUrl !== null) {
      validateImagePath(site.previewImageUrl, repositoryRoot, issues);
    }

    for (const image of site.galleryImages) {
      validateImagePath(image.url, repositoryRoot, issues);
    }
  }
}

function validateImagePath(imagePath: string, repositoryRoot: string, issues: string[]): void {
  if (!imagePath.startsWith("assets/")) {
    return;
  }

  if (!existsSync(join(repositoryRoot, imagePath))) {
    issues.push(`Missing image path: ${imagePath}.`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readSnapshot(path: string): CatalogSnapshot {
  return JSON.parse(readFileSync(path, "utf8")) as CatalogSnapshot;
}

function main(): void {
  const backendRoot = process.cwd();
  const repositoryRoot = resolve(backendRoot, "..");
  const snapshotPath = join(backendRoot, "prisma", "seed-data", "web00-catalog.json");
  const sourcePath = join(repositoryRoot, "assets", "js", "data.js");
  const snapshot = readSnapshot(snapshotPath);
  const sourceText = readFileSync(sourcePath, "utf8");
  const issues = validateCatalogSnapshot(snapshot, {
    expectedCategories: 7,
    expectedSites: 15,
    repositoryRoot,
    sourceSha256: sha256(sourceText)
  });

  if (issues.length > 0) {
    for (const issue of issues) {
      process.stderr.write(`${issue}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `snapshot verification: PASS categories=${snapshot.categories.length} sites=${snapshot.sites.length}\n`
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath !== "" && fileURLToPath(import.meta.url) === entryPath) {
  main();
}
