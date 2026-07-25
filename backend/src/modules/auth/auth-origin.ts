import type { RequestHandler } from "express";
import type { NodeEnvironment } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

export interface OriginGuardOptions {
  authOrigin?: string | undefined;
  nodeEnv: NodeEnvironment;
}

export function createOriginGuard(options: OriginGuardOptions): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get("Origin");

    if (options.nodeEnv === "production" && origin === undefined) {
      next(originNotAllowed());
      return;
    }

    if (
      origin !== undefined &&
      options.authOrigin !== undefined &&
      origin !== options.authOrigin
    ) {
      next(originNotAllowed());
      return;
    }

    next();
  };
}

function originNotAllowed(): AppError {
  return new AppError({
    code: "ORIGIN_NOT_ALLOWED",
    message: "Origin is not allowed.",
    statusCode: 403
  });
}
