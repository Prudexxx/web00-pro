import type { RequestHandler } from "express";

export function adminCacheControl(): RequestHandler {
  return (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");

    if (["DELETE", "PATCH", "POST"].includes(request.method)) {
      response.setHeader("Pragma", "no-cache");
    }

    next();
  };
}
