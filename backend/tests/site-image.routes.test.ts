import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { AuthRequest, AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import type { MultipartImageParser } from "../src/modules/images/image.types.js";
import type { SiteImageService } from "../src/modules/admin/images/site-image.service.js";
import { createSiteImageRouter } from "../src/modules/admin/images/site-image.routes.js";

const siteId = "11111111-1111-4111-8111-111111111111";

describe("admin site image routes", () => {
  it("returns top-level requestId on HTTP 200 partial gallery batch responses", async () => {
    const parser = createParser();
    const service = createService();

    vi.mocked(service.gallery.addBatchStream).mockResolvedValue({
      failed: [
        {
          clientFileId: "33333333-3333-4333-8333-333333333333",
          code: "IMAGE_PROCESSING_TIMEOUT",
          index: 0,
          message: "Image processing timed out.",
          requestId: "req_gallery_route"
        }
      ],
      succeeded: []
    });

    const response = await request(createApp({ parser, service }))
      .post(`/api/admin/sites/${siteId}/images/gallery/batch`)
      .set("X-Request-Id", "req_gallery_route")
      .send(Buffer.alloc(0))
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        failed: [
          {
            code: "IMAGE_PROCESSING_TIMEOUT",
            requestId: "req_gallery_route"
          }
        ],
        succeeded: []
      },
      requestId: "req_gallery_route"
    });
    expect(service.gallery.addBatchStream).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          requestId: "req_gallery_route"
        }),
        siteId
      })
    );
  });
});

function createApp(options: {
  parser: MultipartImageParser;
  service: SiteImageService;
}): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use((request_, _response, next) => {
    (request_ as AuthRequest).auth = principal();
    next();
  });
  app.use(
    "/api/admin",
    createSiteImageRouter({
      now: () => new Date("2026-07-31T12:00:00.000Z"),
      parser: options.parser,
      service: options.service
    })
  );
  app.use(errorHandler);

  return app;
}

function createParser(): MultipartImageParser {
  return {
    parseBatch: vi.fn(),
    parseBatchStream: vi.fn(async function* () {
      return;
    }),
    parseSingle: vi.fn()
  };
}

function createService(): SiteImageService {
  return {
    gallery: {
      addBatch: vi.fn(),
      addBatchStream: vi.fn(),
      addSingle: vi.fn(),
      deleteImage: vi.fn(),
      reorder: vi.fn()
    },
    preview: {
      deletePreview: vi.fn(),
      replacePreview: vi.fn()
    }
  };
}

function principal(): AuthenticatedPrincipal {
  return {
    email: "admin@example.test",
    id: "55555555-5555-4555-8555-555555555555",
    role: "admin",
    sessionId: "66666666-6666-4666-8666-666666666666",
    tokenId: "77777777-7777-4777-8777-777777777777"
  };
}
