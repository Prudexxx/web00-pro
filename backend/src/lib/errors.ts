export type ErrorCode =
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "CORS_ORIGIN_FORBIDDEN"
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
  | "SITE_IMAGES_ATTACHED"
  | "CATEGORY_INACTIVE"
  | "CATEGORY_IN_USE"
  | "SLUG_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_REPLAY_UNAVAILABLE"
  | "INVALID_STATE_TRANSITION"
  | "USER_NOT_FOUND"
  | "USER_EMAIL_CONFLICT"
  | "USER_ROLE_UNCHANGED"
  | "USER_ALREADY_DISABLED"
  | "USER_ALREADY_ACTIVE"
  | "SELF_ROLE_CHANGE_FORBIDDEN"
  | "SELF_DISABLE_FORBIDDEN"
  | "LAST_ACTIVE_ADMIN"
  | "BOOTSTRAP_ALREADY_COMPLETED"
  | "INTERACTIVE_TTY_REQUIRED"
  | "PASSWORD_CONFIRMATION_MISMATCH"
  | "CLI_CONFIRMATION_REQUIRED"
  | "IMAGE_REQUIRED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_BATCH_LIMIT_EXCEEDED"
  | "IMAGE_TOTAL_SIZE_EXCEEDED"
  | "IMAGE_FORMAT_UNSUPPORTED"
  | "IMAGE_MIME_MISMATCH"
  | "IMAGE_INVALID"
  | "IMAGE_ANIMATION_NOT_ALLOWED"
  | "IMAGE_PIXEL_LIMIT_EXCEEDED"
  | "IMAGE_OUTPUT_TOO_LARGE"
  | "IMAGE_PROCESSOR_BUSY"
  | "IMAGE_PROCESSING_TIMEOUT"
  | "IMAGE_STORAGE_TIMEOUT"
  | "GALLERY_LIMIT_EXCEEDED"
  | "GALLERY_DATA_INVALID"
  | "IMAGE_NOT_FOUND"
  | "IMAGE_NOT_MANAGED"
  | "SITE_PREVIEW_REQUIRED"
  | "SITE_IMAGE_STATE_FORBIDDEN"
  | "CLIENT_ABORTED"
  | "REQUEST_CANCELLED"
  | "UPLOAD_ID_CONFLICT"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_CONFIGURATION_INVALID"
  | "STORAGE_CLEANUP_DEFERRED"
  | "DATABASE_TEMPORARY"
  | "CONCURRENT_MODIFICATION"
  | "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID"
  | "PUBLIC_CATALOG_STORAGE_TIMEOUT"
  | "PUBLIC_CATALOG_STORAGE_UNAVAILABLE"
  | "PUBLIC_CATALOG_SNAPSHOT_INVALID"
  | "PUBLIC_CATALOG_DRY_RUN_FAILED"
  | "PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS"
  | "PUBLIC_CATALOG_SYNC_CONFLICT"
  | "PUBLIC_CATALOG_SYNC_FAILED"
  | "RECONCILIATION_STATE_CHANGED"
  | "RECONCILIATION_PRECONDITION_FAILED";

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
