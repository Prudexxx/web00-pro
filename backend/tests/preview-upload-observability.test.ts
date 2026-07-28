import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "../src/lib/errors.js";
import {
  attachPreviewUploadDiagnostic,
  createPreviewStorageDiagnostic,
  createPreviewUploadCompletedEvent,
  createPreviewUploadFailedEvent,
  PREVIEW_UPLOAD_STAGES,
  serializePreviewDiagnosticEvent
} from "../src/modules/admin/images/preview-upload-observability.js";

const expectedStages = [
  "REQUEST_ACCEPTED",
  "MULTIPART_PARSE_STARTED",
  "MULTIPART_PARSED",
  "SITE_LOADED",
  "SITE_STATE_VALIDATED",
  "IMAGE_PROCESS_STARTED",
  "IMAGE_METADATA_READ",
  "IMAGE_WEBP_ENCODED",
  "IMAGE_AVIF_ENCODED",
  "IMAGE_PROCESS_COMPLETED",
  "PREUPLOAD_INSPECTION_STARTED",
  "PREUPLOAD_INSPECTION_COMPLETED",
  "RESERVATIONS_CREATE_STARTED",
  "RESERVATIONS_CREATED",
  "STORAGE_UPLOAD_STARTED",
  "STORAGE_UPLOAD_WEBP_COMPLETED",
  "STORAGE_UPLOAD_AVIF_COMPLETED",
  "STORAGE_UPLOAD_COMPLETED",
  "PREVIEW_URL_SELECTION_STARTED",
  "PREVIEW_URL_SELECTED",
  "DB_ATTACH_STARTED",
  "DB_SITE_UPDATED",
  "DB_RESERVATIONS_COMPLETED",
  "DB_CLEANUP_JOBS_CREATED",
  "DB_AUDIT_CREATED",
  "DB_ATTACH_COMMITTED",
  "ORPHAN_CLEANUP_SCHEDULED",
  "REQUEST_COMPLETED"
] as const;

describe("preview upload observability", () => {
  it("exposes the approved internal preview upload stage map", () => {
    expect(PREVIEW_UPLOAD_STAGES).toEqual(expectedStages);
  });

  it("reports canonical WebP invariant failures with safe request-scoped metadata only", () => {
    const error = attachPreviewUploadDiagnostic(
      new AppError({
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        statusCode: 500
      }),
      {
        internalCode: "PREVIEW_CANONICAL_WEBP_NOT_FOUND",
        largestWebpFound: false,
        processedWidthCount: 3,
        uploadedVariantCount: 5
      }
    );

    const event = createPreviewUploadFailedEvent({
      cleanupScheduled: false,
      elapsedMs: 42,
      error,
      renderRequestIdPresent: true,
      requestId: "req-preview",
      stage: "PREVIEW_URL_SELECTION_STARTED"
    });

    expect(event).toMatchObject({
      cleanupScheduled: false,
      elapsedMs: 42,
      errorClass: "AppError",
      event: "site.preview_upload.failed",
      internalCode: "PREVIEW_CANONICAL_WEBP_NOT_FOUND",
      largestWebpFound: false,
      processedWidthCount: 3,
      renderRequestIdPresent: true,
      requestId: "req-preview",
      stage: "PREVIEW_URL_SELECTION_STARTED",
      timedOut: false,
      uploadedVariantCount: 5
    });
  });

  it("retains safe Supabase provider code and status without raw provider text", () => {
    const providerError = Object.assign(
      new Error(
        "raw sb_secret_value https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/sites/private"
      ),
      {
        code: "StorageApiError",
        statusCode: 503
      }
    );
    const storageError = attachPreviewUploadDiagnostic(
      new AppError({
        code: "STORAGE_WRITE_FAILED",
        message: "Storage write failed.",
        statusCode: 503
      }),
      createPreviewStorageDiagnostic("STORAGE_UPLOAD", providerError)
    );

    const serialized = serializePreviewDiagnosticEvent(
      createPreviewUploadFailedEvent({
        cleanupScheduled: true,
        elapsedMs: 77,
        error: storageError,
        renderRequestIdPresent: false,
        requestId: "req-storage",
        stage: "STORAGE_UPLOAD_STARTED"
      })
    );
    const event = JSON.parse(serialized);

    expect(event).toMatchObject({
      cleanupScheduled: true,
      errorClass: "AppError",
      internalCode: "STORAGE_UPLOAD",
      providerCode: "StorageApiError",
      providerStatus: 503,
      stage: "STORAGE_UPLOAD_STARTED"
    });
    expect(serialized).not.toContain("raw sb_secret_value");
    expect(serialized).not.toContain("qcizrrqkvdgpcgvnnfpb.supabase.co");
    expect(serialized).not.toContain("/storage/v1/object/");
  });

  it("reports exact Prisma attach stage and Prisma code while public API stays generic", () => {
    const prismaError = Object.assign(new Error("raw SQL with user table details"), {
      code: "P2028",
      name: "PrismaClientKnownRequestError"
    });

    const event = createPreviewUploadFailedEvent({
      cleanupScheduled: true,
      elapsedMs: 99,
      error: prismaError,
      renderRequestIdPresent: true,
      requestId: "req-prisma",
      stage: "DB_SITE_UPDATED"
    });

    expect(event).toMatchObject({
      errorClass: "PrismaClientKnownRequestError",
      prismaCode: "P2028",
      stage: "DB_SITE_UPDATED",
      timedOut: true
    });
    expect(toAppError(prismaError)).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error."
    });
    expect(JSON.stringify(event)).not.toContain("raw SQL");
  });

  it("reports Sharp image stages without raw Sharp message or stack", () => {
    const sharpError = Object.assign(new Error("Input buffer contains password=secret"), {
      name: "SharpError",
      stack: "SharpError: path sites/11111111-1111-4111-8111-111111111111/preview/private"
    });

    const serialized = serializePreviewDiagnosticEvent(
      createPreviewUploadFailedEvent({
        cleanupScheduled: false,
        elapsedMs: 12,
        error: sharpError,
        renderRequestIdPresent: false,
        requestId: "req-sharp",
        stage: "IMAGE_METADATA_READ"
      })
    );

    expect(JSON.parse(serialized)).toMatchObject({
      errorClass: "SharpError",
      stage: "IMAGE_METADATA_READ",
      timedOut: false
    });
    expect(serialized).not.toContain("password=secret");
    expect(serialized).not.toContain("sites/11111111-1111-4111-8111-111111111111");
  });

  it("redacts forbidden fields from serialized diagnostic log entries", () => {
    const serialized = serializePreviewDiagnosticEvent({
      Authorization: "Bearer access-token",
      Cookie: "refresh_token=secret",
      databaseUrl: "postgresql://user:pass@db.example.test:5432/app",
      email: "admin@example.com",
      event: "site.preview_upload.failed",
      nested: {
        password: "plaintext",
        serviceKey: "sb_secret_service_role",
        storagePath:
          "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/1200.webp",
        token: "refresh-token",
        uuid: "33333333-3333-4333-8333-333333333333"
      },
      requestId: "req-redaction",
      supabaseUrl: "https://qcizrrqkvdgpcgvnnfpb.supabase.co"
    });

    expect(serialized).toContain("site.preview_upload.failed");
    expect(serialized).toContain("req-redaction");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Cookie");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("supabase.co");
    expect(serialized).not.toContain("sb_secret_");
    expect(serialized).not.toContain("sites/11111111-1111-4111-8111-111111111111");
    expect(serialized).not.toContain("33333333-3333-4333-8333-333333333333");
  });

  it("emits the optional success timing event with variant count only", () => {
    expect(
      createPreviewUploadCompletedEvent({
        elapsedMs: 123,
        requestId: "req-complete",
        variantCount: 6
      })
    ).toEqual({
      elapsedMs: 123,
      event: "site.preview_upload.completed",
      requestId: "req-complete",
      variantCount: 6
    });
  });
});
