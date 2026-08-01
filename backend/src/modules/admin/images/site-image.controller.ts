import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";
import type { MultipartImageParser } from "../../images/image.types.js";
import type { SiteImageService } from "./site-image.service.js";
import {
  parseGalleryDeleteParams,
  parseGalleryReorderInput,
  parseSiteImageParams
} from "./site-image.schemas.js";

export interface SiteImageController {
  addGalleryBatch: RequestHandler;
  addGallerySingle: RequestHandler;
  deleteGalleryImage: RequestHandler;
  deletePreview: RequestHandler;
  replacePreview: RequestHandler;
  reorderGallery: RequestHandler;
}

export function createSiteImageController(options: {
  now?: () => Date;
  parser: MultipartImageParser;
  service: SiteImageService;
}): SiteImageController {
  const now = options.now ?? (() => new Date());

  return {
    addGalleryBatch: async (request, response, next) => {
      const abortController = new AbortController();
      const abort = () => {
        abortController.abort();
      };
      const abortOnEarlyClose = () => {
        if (!isReadableEnded(request)) {
          abort();
        }
      };

      request.once("aborted", abort);
      request.once("close", abortOnEarlyClose);

      try {
        const { id } = parseSiteImageParams(request.params);
        const context = createContext(request as AuthRequest, response, now);
        const result = await options.service.gallery.addBatchStream({
          context,
          files: options.parser.parseBatchStream(request),
          signal: abortController.signal,
          siteId: id
        });

        response.status(200).json({ data: result, requestId: context.requestId });
      } catch (error) {
        next(error);
      } finally {
        request.removeListener("aborted", abort);
        request.removeListener("close", abortOnEarlyClose);
      }
    },
    addGallerySingle: async (request, response, next) => {
      const abortState = createRequestAbortState(request);

      try {
        const { id } = parseSiteImageParams(request.params);
        const result = await options.service.gallery.addSingle({
          context: createContext(request as AuthRequest, response, now),
          file: await options.parser.parseSingle(request),
          signal: abortState.signal,
          siteId: id
        });

        response.status(result.replayed ? 200 : 201).json({ data: result });
      } catch (error) {
        next(error);
      } finally {
        abortState.cleanup();
      }
    },
    deleteGalleryImage: async (request, response, next) => {
      try {
        const { assetId, id } = parseGalleryDeleteParams(request.params);

        response.json({
          data: await options.service.gallery.deleteImage({
            assetId,
            context: createContext(request as AuthRequest, response, now),
            siteId: id
          })
        });
      } catch (error) {
        next(error);
      }
    },
    deletePreview: async (request, response, next) => {
      try {
        const { id } = parseSiteImageParams(request.params);

        response.json({
          data: await options.service.preview.deletePreview({
            context: createContext(request as AuthRequest, response, now),
            siteId: id
          })
        });
      } catch (error) {
        next(error);
      }
    },
    replacePreview: async (request, response, next) => {
      const abortState = createRequestAbortState(request);

      try {
        const { id } = parseSiteImageParams(request.params);

        response.json({
          data: await options.service.preview.replacePreview({
            context: createContext(request as AuthRequest, response, now),
            file: await options.parser.parseSingle(request),
            signal: abortState.signal,
            siteId: id
          })
        });
      } catch (error) {
        next(error);
      } finally {
        abortState.cleanup();
      }
    },
    reorderGallery: async (request, response, next) => {
      try {
        const { id } = parseSiteImageParams(request.params);

        response.json({
          data: await options.service.gallery.reorder({
            ...parseGalleryReorderInput(request.body),
            context: createContext(request as AuthRequest, response, now),
            siteId: id
          })
        });
      } catch (error) {
        next(error);
      }
    }
  };
}

function createRequestAbortState(request: NodeJS.ReadableStream): {
  cleanup: () => void;
  signal: AbortSignal;
} {
  const abortController = new AbortController();
  const abort = () => {
    abortController.abort();
  };
  const abortOnEarlyClose = () => {
    if (!isReadableEnded(request)) {
      abort();
    }
  };

  request.once("aborted", abort);
  request.once("close", abortOnEarlyClose);

  return {
    cleanup() {
      request.removeListener("aborted", abort);
      request.removeListener("close", abortOnEarlyClose);
    },
    signal: abortController.signal
  };
}

function createContext(request: AuthRequest, response: Response, now: () => Date) {
  return {
    actor: request.auth!,
    now: now(),
    renderRequestIdPresent: hasRenderRequestId(request),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown"
  };
}

function hasRenderRequestId(request: AuthRequest): boolean {
  const rndrId = request.get("rndr-id");
  const renderRequestId = request.get("x-render-request-id");

  return (
    (typeof rndrId === "string" && rndrId.trim().length > 0) ||
    (typeof renderRequestId === "string" && renderRequestId.trim().length > 0)
  );
}

function isReadableEnded(request: NodeJS.ReadableStream): boolean {
  return (
    "readableEnded" in request &&
    (request as NodeJS.ReadableStream & { readableEnded?: boolean }).readableEnded === true
  );
}
