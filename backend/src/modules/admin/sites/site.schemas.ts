import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type {
  AdminSiteListQuery,
  AdminSiteStatus,
  CreateAdminSiteInput,
  UpdateAdminSiteInput
} from "./site.types.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const int32Max = 2_147_483_647;
const int32MaxMessage = "Must be at most 2147483647.";
const demoModeMessage = "Выберите допустимый режим демо.";
const slugSchema = z.string().trim().toLowerCase().min(1).max(120).regex(slugPattern);
const uuidSchema = z.string().uuid();
const nullableText = (max: number) =>
  z.string().trim().max(max).transform(emptyToNull).nullable();
const optionalUrl = z.string().trim().url().max(2048).nullable();
const stringArraySchema = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);
const demoModeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? null : trimmed;
  },
  z
    .custom<"none" | "external-iframe" | null>(
      (value) => value === null || value === "none" || value === "external-iframe",
      { message: demoModeMessage }
    )
);

const siteMutableFields = {
  categoryId: uuidSchema,
  deliveryLabel: nullableText(80).optional(),
  demoLocalUrl: optionalUrl.optional(),
  demoMode: demoModeSchema.optional(),
  demoUrl: optionalUrl.optional(),
  developmentDays: z
    .number()
    .int()
    .positive()
    .max(int32Max, { message: int32MaxMessage })
    .nullable()
    .optional(),
  externalDemoUrl: optionalUrl.optional(),
  features: stringArraySchema(30, 160).optional(),
  fullDescription: nullableText(5000).optional(),
  legacyTitle: nullableText(160).optional(),
  originalDemoUrl: optionalUrl.optional(),
  previewType: nullableText(40).optional(),
  priceAmountCents: z
    .number()
    .int()
    .positive()
    .max(int32Max, { message: int32MaxMessage })
    .nullable()
    .optional(),
  priceLabel: nullableText(80).optional(),
  shortDescription: z.string().trim().min(1).max(500),
  siteUrl: optionalUrl.optional(),
  sortOrder: z.number().int().min(0).max(int32Max, { message: int32MaxMessage }).optional(),
  tags: stringArraySchema(30, 80).optional(),
  title: z.string().trim().min(1).max(160)
} satisfies z.ZodRawShape;

const createSiteSchema = z
  .object({
    ...siteMutableFields,
    slug: slugSchema
  })
  .strict();

const editorPatchSchema = z
  .object({
    ...makeOptionalShape(siteMutableFields)
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Must include at least one field.");

const adminPatchSchema = z
  .object({
    ...makeOptionalShape(siteMutableFields),
    featured: z.boolean().optional(),
    slug: slugSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Must include at least one field.");

const siteListQueryKeys = new Set([
  "active",
  "category",
  "deleted",
  "direction",
  "featured",
  "limit",
  "page",
  "search",
  "sort",
  "status"
]);

export function parseCreateAdminSiteInput(input: unknown): CreateAdminSiteInput {
  return parseWithSchema(createSiteSchema, input) as CreateAdminSiteInput;
}

export function parseUpdateAdminSiteInput(
  input: unknown,
  role: "admin" | "editor"
): UpdateAdminSiteInput {
  return parseWithSchema(
    role === "admin" ? adminPatchSchema : editorPatchSchema,
    input
  ) as UpdateAdminSiteInput;
}

export function parseSiteIdParams(input: unknown): { id: string } {
  return parseWithSchema(z.object({ id: uuidSchema }).strict(), input) as { id: string };
}

export function parseAdminSiteListQuery(input: unknown): AdminSiteListQuery {
  const query = asRecord(input);

  rejectUnknownKeys(query, siteListQueryKeys);

  const parsed: AdminSiteListQuery = {
    deleted: parseDeleted(query.deleted),
    direction: parseDirection(query.direction),
    limit: parseInteger(query.limit, "limit", 20, { max: 100, min: 1 }),
    page: parseInteger(query.page, "page", 1, { min: 1 }),
    sort: parseSort(query.sort)
  };
  const status = parseStatus(query.status);
  const active = parseOptionalBoolean(query.active, "active");
  const featured = parseOptionalBoolean(query.featured, "featured");
  const category = parseOptionalUuid(query.category, "category");
  const search = parseOptionalString(query.search, "search", 100);

  if (status !== undefined) {
    parsed.status = status;
  }
  if (active !== undefined) {
    parsed.active = active;
  }
  if (featured !== undefined) {
    parsed.featured = featured;
  }
  if (category !== undefined) {
    parsed.category = category;
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

function makeOptionalShape(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    (Object.entries(shape) as [string, z.ZodTypeAny][]).map(([key, schema]) => [
      key,
      schema.optional()
    ])
  );
}

function parseSort(value: unknown): AdminSiteListQuery["sort"] {
  if (value === undefined) {
    return "updatedAt";
  }

  if (
    value === "updatedAt" ||
    value === "createdAt" ||
    value === "title" ||
    value === "sortOrder"
  ) {
    return value;
  }

  throw validationError([{ message: "Must be an approved sort.", path: "sort" }]);
}

function parseDirection(value: unknown): AdminSiteListQuery["direction"] {
  if (value === undefined) {
    return "desc";
  }

  if (value === "asc" || value === "desc") {
    return value;
  }

  throw validationError([{ message: "Must be asc or desc.", path: "direction" }]);
}

function parseDeleted(value: unknown): AdminSiteListQuery["deleted"] {
  if (value === undefined) {
    return "without";
  }

  if (value === "without" || value === "with" || value === "only") {
    return value;
  }

  throw validationError([{ message: "Must be without, with, or only.", path: "deleted" }]);
}

function parseStatus(value: unknown): AdminSiteStatus | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (value === "draft" || value === "published" || value === "archived") {
    return value;
  }

  throw validationError([{ message: "Must be an approved site status.", path: "status" }]);
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

function parseOptionalUuid(value: unknown, path: string): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !uuidSchema.safeParse(value).success) {
    throw validationError([{ message: "Must be a valid UUID.", path }]);
  }

  return value;
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

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}
