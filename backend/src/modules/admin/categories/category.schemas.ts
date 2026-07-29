import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type {
  AdminCategoryListQuery,
  CreateAdminCategoryInput,
  UpdateAdminCategoryInput
} from "./category.types.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z.string().trim().toLowerCase().min(1).max(120).regex(slugPattern);
const categoryFields = {
  active: z.boolean().optional(),
  description: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
  title: z.string().trim().min(1).max(120)
} satisfies z.ZodRawShape;
const createCategorySchema = z
  .object({
    ...categoryFields,
    slug: slugSchema
  })
  .strict();
const updateCategorySchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(categoryFields).map(([key, schema]) => [key, schema.optional()])
    ),
    slug: slugSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Must include at least one field.");
const categoryListQueryKeys = new Set(["active", "includeCounts", "limit", "page", "search"]);
const uuidSchema = z.string().uuid();

export function parseCreateAdminCategoryInput(input: unknown): CreateAdminCategoryInput {
  return parseWithSchema(createCategorySchema, input) as CreateAdminCategoryInput;
}

export function parseUpdateAdminCategoryInput(input: unknown): UpdateAdminCategoryInput {
  return parseWithSchema(updateCategorySchema, input) as UpdateAdminCategoryInput;
}

export function parseCategoryIdParams(input: unknown): { id: string } {
  return parseWithSchema(z.object({ id: uuidSchema }).strict(), input) as { id: string };
}

export function parseAdminCategoryListQuery(input: unknown): AdminCategoryListQuery {
  const query = asRecord(input);

  rejectUnknownKeys(query, categoryListQueryKeys);

  const parsed: AdminCategoryListQuery = {
    includeCounts: parseBoolean(query.includeCounts, "includeCounts", false),
    limit: parseInteger(query.limit, "limit", 50, { max: 100, min: 1 }),
    page: parseInteger(query.page, "page", 1, { min: 1 })
  };
  const active = parseOptionalBoolean(query.active, "active");
  const search = parseOptionalString(query.search, "search", 100);

  if (active !== undefined) {
    parsed.active = active;
  }
  if (search !== undefined) {
    parsed.search = search;
  }

  return parsed;
}

function parseWithSchema(schema: z.ZodType, input: unknown): unknown {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw validationError(
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      }))
    );
  }

  return parsed.data;
}

function parseInteger(
  value: unknown,
  path: string,
  defaultValue: number,
  options: { max?: number; min: number }
): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw validationError([{ message: "Must be a positive integer.", path }]);
  }

  const parsed = Number.parseInt(value, 10);

  if (parsed < options.min) {
    throw validationError([{ message: `Must be at least ${options.min}.`, path }]);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw validationError([{ message: `Must be at most ${options.max}.`, path }]);
  }

  return parsed;
}

function parseBoolean(value: unknown, path: string, defaultValue: boolean): boolean {
  return parseOptionalBoolean(value, path) ?? defaultValue;
}

function parseOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw validationError([{ message: "Must be true or false.", path }]);
}

function parseOptionalString(
  value: unknown,
  path: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw validationError([{ message: "Must be a string.", path }]);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw validationError([{ message: `Must be at most ${maxLength} characters.`, path }]);
  }

  return trimmed;
}

function rejectUnknownKeys(
  query: Record<string, unknown>,
  allowed: ReadonlySet<string>
): void {
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      throw validationError([{ message: "Unknown query field.", path: key }]);
    }
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input === undefined) {
    return {};
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw validationError([{ message: "Must be an object.", path: "query" }]);
  }

  return input as Record<string, unknown>;
}

function validationError(details: readonly ErrorDetail[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
