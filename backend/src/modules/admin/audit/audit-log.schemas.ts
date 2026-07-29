import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type { AdminAuditLogQuery } from "./audit-log.types.js";

const auditQueryKeys = new Set([
  "action",
  "actorUserId",
  "entityId",
  "entityType",
  "from",
  "limit",
  "page",
  "sort",
  "to"
]);
const uuidSchema = z.string().uuid();

export function parseAdminAuditLogQuery(input: unknown): AdminAuditLogQuery {
  const query = asRecord(input);

  rejectUnknownKeys(query, auditQueryKeys);

  const parsed: AdminAuditLogQuery = {
    limit: parseInteger(query.limit, "limit", 50, { max: 100, min: 1 }),
    page: parseInteger(query.page, "page", 1, { min: 1 }),
    sort: parseSort(query.sort)
  };
  const action = parseOptionalString(query.action, "action", 80);
  const entityType = parseEntityType(query.entityType);
  const entityId = parseOptionalUuid(query.entityId, "entityId");
  const actorUserId = parseOptionalUuid(query.actorUserId, "actorUserId");
  const from = parseOptionalDate(query.from, "from");
  const to = parseOptionalDate(query.to, "to");

  if (action !== undefined) {
    parsed.action = action;
  }
  if (entityType !== undefined) {
    parsed.entityType = entityType;
  }
  if (entityId !== undefined) {
    parsed.entityId = entityId;
  }
  if (actorUserId !== undefined) {
    parsed.actorUserId = actorUserId;
  }
  if (from !== undefined) {
    parsed.from = from;
  }
  if (to !== undefined) {
    parsed.to = to;
  }

  return parsed;
}

function parseEntityType(value: unknown): AdminAuditLogQuery["entityType"] {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (
    value === "auth" ||
    value === "category" ||
    value === "site" ||
    value === "upload" ||
    value === "user"
  ) {
    return value;
  }

  throw validationError([{ message: "Must be an approved entity type.", path: "entityType" }]);
}

function parseSort(value: unknown): AdminAuditLogQuery["sort"] {
  if (value === undefined) {
    return "newest";
  }
  if (value === "newest" || value === "oldest") {
    return value;
  }

  throw validationError([{ message: "Must be newest or oldest.", path: "sort" }]);
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

function parseOptionalDate(value: unknown, path: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw validationError([{ message: "Must be an ISO datetime.", path }]);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw validationError([{ message: "Must be an ISO datetime.", path }]);
  }

  return date;
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
