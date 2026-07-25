import { z } from "zod";
import { AppError, type ErrorDetail } from "../../lib/errors.js";
import type {
  CategoryDetailQuery,
  CategoryListQuery,
  PopularSitesQuery,
  SiteListQuery,
  SiteSort
} from "./public-catalog.types.js";

export const siteSortSchema = z.enum(["sortOrder", "newest", "popular", "title"]);

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z.string().trim().min(1).max(120).regex(slugPattern);
const siteListQueryKeys = new Set(["category", "limit", "page", "search", "sort", "tags"]);
const popularSitesQueryKeys = new Set(["category", "limit"]);
const categoryListQueryKeys = new Set(["includeCounts"]);
const categoryDetailQueryKeys = new Set(["includeSites", "limit", "page", "sort"]);

export function parseSiteListQuery(input: unknown): SiteListQuery {
  const query = asQueryRecord(input);

  rejectUnknownKeys(query, siteListQueryKeys);

  const page = parseIntegerQuery(query.page, "page", 1, { min: 1 });
  const limit = parseIntegerQuery(query.limit, "limit", 12, { max: 20, min: 1 });
  const sort = parseSiteSort(query.sort);
  const tags = normalizeTags(query.tags);
  const category = parseOptionalSlug(query.category, "category");
  const search = parseOptionalTrimmedString(query.search, "search", 100);
  const parsed: SiteListQuery = { limit, page, sort, tags };

  if (category !== undefined) {
    parsed.category = category;
  }

  if (search !== undefined) {
    parsed.search = search;
  }

  return parsed;
}

export function parsePopularSitesQuery(input: unknown): PopularSitesQuery {
  const query = asQueryRecord(input);

  rejectUnknownKeys(query, popularSitesQueryKeys);

  const limit = parseIntegerQuery(query.limit, "limit", 6, { max: 20, min: 1 });
  const category = parseOptionalSlug(query.category, "category");
  const parsed: PopularSitesQuery = { limit };

  if (category !== undefined) {
    parsed.category = category;
  }

  return parsed;
}

export function parseCategoryListQuery(input: unknown): CategoryListQuery {
  const query = asQueryRecord(input);

  rejectUnknownKeys(query, categoryListQueryKeys);

  return {
    includeCounts: parseBooleanQuery(query.includeCounts, "includeCounts", false)
  };
}

export function parseCategoryDetailQuery(input: unknown): CategoryDetailQuery {
  const query = asQueryRecord(input);

  rejectUnknownKeys(query, categoryDetailQueryKeys);

  return {
    includeSites: parseBooleanQuery(query.includeSites, "includeSites", false),
    limit: parseIntegerQuery(query.limit, "limit", 12, { max: 20, min: 1 }),
    page: parseIntegerQuery(query.page, "page", 1, { min: 1 }),
    sort: parseSiteSort(query.sort)
  };
}

export function parseSlugParam(input: unknown, path: string): string {
  if (!isRecord(input)) {
    throw validationError(path, "Must be a valid slug.");
  }

  return parseRequiredSlug(input[path], path);
}

export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === "") {
    return [];
  }

  if (typeof value !== "string") {
    throw validationError("tags", "Must be a comma-separated string.");
  }

  const tags = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLocaleLowerCase("ru-RU"))
        .filter((tag) => tag.length > 0)
    )
  );

  if (tags.length > 10) {
    throw validationError("tags", "Must contain no more than 10 tags.");
  }

  return tags;
}

function parseIntegerQuery(
  value: unknown,
  field: string,
  defaultValue: number,
  options: { max?: number; min: number }
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw validationError(field, "Must be a positive integer.");
  }

  const parsed = Number.parseInt(value, 10);

  if (parsed < options.min) {
    throw validationError(field, `Must be at least ${options.min}.`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw validationError(field, `Must be at most ${options.max}.`);
  }

  return parsed;
}

function parseBooleanQuery(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw validationError(field, "Must be true or false.");
}

function parseSiteSort(value: unknown): SiteSort {
  if (value === undefined) {
    return "sortOrder";
  }

  const parsed = siteSortSchema.safeParse(value);

  if (!parsed.success) {
    throw validationError("sort", "Must be an approved site sort.");
  }

  return parsed.data;
}

function parseOptionalSlug(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  return parseRequiredSlug(value, field);
}

function parseRequiredSlug(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw validationError(field, "Must be a valid slug.");
  }

  const parsed = slugSchema.safeParse(value);

  if (!parsed.success) {
    throw validationError(field, "Must be a valid slug.");
  }

  return parsed.data;
}

function parseOptionalTrimmedString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw validationError(field, "Must be a string.");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw validationError(field, `Must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function rejectUnknownKeys(query: Record<string, unknown>, allowedKeys: ReadonlySet<string>): void {
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      throw validationError(key, "Unknown query field.");
    }
  }
}

function asQueryRecord(input: unknown): Record<string, unknown> {
  if (input === undefined) {
    return {};
  }

  if (!isRecord(input)) {
    throw validationError("query", "Must be an object.");
  }

  return input;
}

function validationError(path: string, message: string): AppError {
  const details: ErrorDetail[] = [{ message, path }];

  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
