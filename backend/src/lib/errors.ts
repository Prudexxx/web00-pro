export type ErrorCode =
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "USER_DISABLED"
  | "REFRESH_REQUIRED"
  | "REFRESH_INVALID"
  | "REFRESH_EXPIRED"
  | "REFRESH_REUSED"
  | "ORIGIN_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "SITE_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "FORBIDDEN"
  | "SITE_NOT_DRAFT"
  | "SITE_NOT_PUBLISHED"
  | "SITE_ALREADY_DELETED"
  | "SITE_NOT_DELETED"
  | "CATEGORY_INACTIVE"
  | "CATEGORY_IN_USE"
  | "SLUG_CONFLICT"
  | "INVALID_STATE_TRANSITION";

export interface ErrorDetail {
  code?: string;
  message: string;
  path?: string;
}

export interface AppErrorOptions {
  code: ErrorCode;
  details?: readonly ErrorDetail[];
  message: string;
  statusCode: number;
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    details?: readonly ErrorDetail[];
    message: string;
    requestId: string;
  };
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details: readonly ErrorDetail[];
  public readonly statusCode: number;

  public constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.details = options.details ?? [];
    this.statusCode = options.statusCode;
  }
}

export function createErrorResponse(
  error: AppError,
  requestId: string
): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details.length > 0 ? { details: error.details } : {})
    }
  };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isParserError(error, "entity.parse.failed", 400)) {
    return new AppError({
      code: "INVALID_JSON",
      message: "Invalid JSON body.",
      statusCode: 400
    });
  }

  if (isParserError(error, "entity.too.large", 413)) {
    return new AppError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body too large.",
      statusCode: 413
    });
  }

  return new AppError({
    code: "INTERNAL_ERROR",
    message: "Internal server error.",
    statusCode: 500
  });
}

function isParserError(error: unknown, type: string, statusCode: number): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const actualStatus = readStatusCode(error);

  return error.type === type && actualStatus === statusCode;
}

function readStatusCode(error: Record<string, unknown>): number | undefined {
  if (typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if (typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
