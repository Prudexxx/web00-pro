import { createHash } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import { parseSiteIdParams } from "../sites/site.schemas.js";
import type { AdminPublicationService } from "./publication.service.js";
import type {
  PagesCatalogPublicationAction,
  PagesCatalogPublicationLifecycleAction,
  PagesCatalogPublicationService
} from "./pages-publication.service.js";

const actionSchema = z.object({
  action: z.enum(["publish", "unpublish"]),
  idempotencyKey: z.string().uuid().optional()
}).strict();
const operationParamsSchema = z.object({ id: z.string().uuid() }).strict();
const cardIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const pagesPublicationInputSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  card: z.record(z.string(), z.unknown()).nullable(),
  cardId: cardIdSchema,
  expectedBlobSha: z.string().min(1).nullable(),
  lifecycleAction: z.enum(["publish", "unpublish", "delete"]),
  requestId: z.string().uuid(),
  siteId: z.string().uuid()
}).strict();
const pagesCardParamsSchema = z.object({ cardId: cardIdSchema }).strict();
const pagesRequestParamsSchema = z.object({ requestId: z.string().uuid() }).strict();

export interface AdminPublicationController {
  getOperation: RequestHandler;
  getPagesCatalogCard: RequestHandler;
  getPagesPublicationStatus: RequestHandler;
  startPagesPublication: RequestHandler;
  startPublication: RequestHandler;
}

export function createAdminPublicationController(options: {
  now?: () => Date;
  pagesService?: PagesCatalogPublicationService;
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

    getPagesCatalogCard: async (request, response, next) => {
      try {
        const { cardId } = parsePagesCardParams(request.params);
        response.json({
          data: await readPagesPublicationService(options).getCatalogCard(cardId)
        });
      } catch (error) {
        next(error);
      }
    },

    getPagesPublicationStatus: async (request, response, next) => {
      try {
        const principal = (request as AuthRequest).auth!;
        const { requestId } = parsePagesRequestParams(request.params);
        response.json({
          data: await readPagesPublicationService(options).getPagesPublicationStatus(requestId, {
            actor: principal,
            now: now()
          })
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
    },

    startPagesPublication: async (request, response, next) => {
      try {
        assertCsrfBoundary(request);
        const principal = (request as AuthRequest).auth!;
        const input = parsePagesPublicationInput(request.body);

        response.status(202).json({
          data: await readPagesPublicationService(options).startPagesPublication({
            action: input.action,
            actor: principal,
            card: input.card,
            cardId: input.cardId,
            expectedBlobSha: input.expectedBlobSha,
            lifecycleAction: input.lifecycleAction,
            now: now(),
            requestId: input.requestId,
            siteId: input.siteId
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

function parsePagesPublicationInput(input: unknown): {
  action: PagesCatalogPublicationAction;
  card: Record<string, unknown> | null;
  cardId: string;
  expectedBlobSha: string | null;
  lifecycleAction: PagesCatalogPublicationLifecycleAction;
  requestId: string;
  siteId: string;
} {
  const parsed = pagesPublicationInputSchema.safeParse(input);
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

function parsePagesCardParams(input: unknown): { cardId: string } {
  const parsed = pagesCardParamsSchema.safeParse(input);
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

function parsePagesRequestParams(input: unknown): { requestId: string } {
  const parsed = pagesRequestParamsSchema.safeParse(input);
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

function readPagesPublicationService(options: {
  pagesService?: PagesCatalogPublicationService;
}): PagesCatalogPublicationService {
  if (options.pagesService === undefined) {
    throw new AppError({
      code: "GITHUB_REPOSITORY_SETUP_REQUIRED",
      message: "GitHub Pages publication is not configured.",
      statusCode: 503
    });
  }

  return options.pagesService;
}

function validationError(details: readonly ErrorDetail[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
