import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type { AdminUserListQuery } from "./user.types.js";

const uuidSchema = z.string().uuid();
const listQueryKeys = new Set([
  "active",
  "direction",
  "limit",
  "page",
  "role",
  "search",
  "sort"
]);

export function parseUserIdParams(input: unknown): { id: string } {
  return parseWithSchema(z.object({ id: uuidSchema }).strict(), input) as { id: string };
}

export function parseChangeUserRoleBody(input: unknown): { role: "admin" | "editor" } {
  return parseWithSchema(
    z.object({ role: z.enum(["admin", "editor"]) }).strict(),
    input
  ) as { role: "admin" | "editor" };
}

export function parseAdminUserListQuery(input: unknown): AdminUserListQuery {
  const query = asRecord(input);

  rejectUnknownKeys(query, listQueryKeys);

  const parsed: AdminUserListQuery = {
    direction: parseDirection(query.direction),
    limit: parseInteger(query.limit, "limit", 50, { max: 100, min: 1 }),
    page: parseInteger(query.page, "page", 1, { min: 1 }),
    sort: parseSort(query.sort)
  };
  const active = parseOptionalBoolean(query.active, "active");
  const role = parseRole(query.role);
  const search = parseOptionalString(query.search, "search", 100);

  if (active !== undefined) {
    parsed.active = active;
  }
  if (role !== undefined) {
    parsed.role = role;
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

function parseSort(value: unknown): AdminUserListQuery["sort"] {
  if (value === undefined) {
    return "createdAt";
  }

  if (
    value === "createdAt" ||
    value === "updatedAt" ||
    value === "email" ||
    value === "role" ||
    value === "lastLoginAt"
  ) {
    return value;
  }

  throw validationError([{ message: "Must be an approved sort.", path: "sort" }]);
}

function parseDirection(value: unknown): AdminUserListQuery["direction"] {
  if (value === undefined) {
    return "desc";
  }

  if (value === "asc" || value === "desc") {
    return value;
  }

  throw validationError([{ message: "Must be asc or desc.", path: "direction" }]);
}

function parseRole(value: unknown): AdminUserListQuery["role"] | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (value === "admin" || value === "editor") {
    return value;
  }

  throw validationError([{ message: "Must be admin or editor.", path: "role" }]);
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
