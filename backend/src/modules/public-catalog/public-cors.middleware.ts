import type { RequestHandler, Response } from "express";
import type { PublicCorsConfig } from "../../config/public-cors-env.js";
import { AppError } from "../../lib/errors.js";

const allowedHeaders = "Content-Type, X-Request-Id";

export function createPublicCatalogCorsMiddleware(
  config: PublicCorsConfig
): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("Origin");

    response.vary("Origin");

    if (origin !== undefined && config.allowedOrigins.has(origin)) {
      setPublicCorsHeaders(response, origin, config);
    }

    next();
  };
}

export function createPublicCatalogPreflightHandler(
  config: PublicCorsConfig
): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("Origin");

    response.vary("Origin");

    if (origin === undefined || !config.allowedOrigins.has(origin)) {
      next(
        new AppError({
          code: "CORS_ORIGIN_FORBIDDEN",
          message: "Origin is not allowed.",
          statusCode: 403
        })
      );
      return;
    }

    setPublicCorsHeaders(response, origin, config);
    response.status(204).end();
  };
}

function setPublicCorsHeaders(
  response: Response,
  origin: string,
  config: PublicCorsConfig
): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.vary("Origin");
  response.setHeader("Access-Control-Allow-Methods", config.allowedMethods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
}
