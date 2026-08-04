import { createHash } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import { parseSiteIdParams } from "../sites/site.schemas.js";
import type { AdminPublicationService } from "./publication.service.js";

const actionSchema = z.object({
  action: z.enum(["publish", "unpublish"]),
  idempotencyKey: z.string().uuid().optional()
}).strict();
const operationParamsSchema = z.object({ id: z.string().uuid() }).strict();

export interface AdminPublicationController {
  getOperation: RequestHandler;
  startPublication: RequestHandler;
}

export function createAdminPublicationController(options: {
  now?: () => Date;
  service: AdminPublicationService;
}): AdminPublicationController {
  const now = options.now ?? (() => new Date());

  return {
    getOperation: async (request, response, next) => {
      try {
        const { id } = parseOperationIdParams(request.params);

        response.json({
          data: await options.service.getOperation(id)
        });
      } catch (error) {
        next(error);
      }
    },

    startPublication: async (request, response, next) => {
      try {
        assertCsrfBoundary(request);
        const principal = (request as AuthRequest).auth!;
        const { id: siteId } = parseSiteIdParams(request.params);
        const input = parsePublicationInput(request.body);
        const idempotencyKey = readIdempotencyKey(request, input.idempotencyKey);
        const requestId = readRequestId(response);
        const requestFingerprint = createPublicationRequestFingerprint({
          action: input.action,
          siteId
        });

        response.status(202).json({
          data: await options.service.startPublication({
            action: input.action,
            actor: principal,
            idempotencyKey,
            now: now(),
            requestFingerprint,
            requestId,
            siteId
          })
        });
      } catch (error) {
        next(error);
      }
    }
  };
}

function parsePublicationInput(input: unknown): {
  action: "publish" | "unpublish";
  idempotencyKey?: string;
} {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError(
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      }))
    );
  }

  return parsed.data.idempotencyKey === undefined
    ? { action: parsed.data.action }
    : { action: parsed.data.action, idempotencyKey: parsed.data.idempotencyKey };
}

function parseOperationIdParams(input: unknown): { id: string } {
  const parsed = operationParamsSchema.safeParse(input);
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

function readIdempotencyKey(request: Parameters<RequestHandler>[0], bodyKey?: string): string {
  const headerKey = request.get("Idempotency-Key")?.trim();

  if (headerKey !== undefined && headerKey.length > 0 && bodyKey !== undefined && headerKey !== bodyKey) {
    throw validationError([
      {
        message: "Idempotency header and body key must match.",
        path: "idempotencyKey"
      }
    ]);
  }

  const idempotencyKey = headerKey?.length ? headerKey : bodyKey;
  if (idempotencyKey === undefined || !z.string().uuid().safeParse(idempotencyKey).success) {
    throw validationError([
      {
        message: "Idempotency-Key header must be a UUID.",
        path: "Idempotency-Key"
      }
    ]);
  }

  return idempotencyKey;
}

function assertCsrfBoundary(request: Parameters<RequestHandler>[0]): void {
  const cookie = request.get("Cookie")?.trim();
  const csrf = request.get("X-CSRF-Token")?.trim();

  if (!cookie || !csrf) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Forbidden.",
      statusCode: 403
    });
  }
}

function createPublicationRequestFingerprint(input: {
  action: "publish" | "unpublish";
  siteId: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      action: input.action,
      contract: "web00-public-catalog-v2-publication",
      siteId: input.siteId
    }))
    .digest("hex");
}

function readRequestId(response: Response): string {
  return typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown";
}

function validationError(details: readonly ErrorDetail[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
