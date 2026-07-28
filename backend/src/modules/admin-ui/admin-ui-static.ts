import express, { type RequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../lib/errors.js";
import { setAdminUiNoStore } from "./admin-ui-security.js";

export interface AdminUiStaticPaths {
  assetRoot: string;
  indexFile: string;
}

export function resolveAdminUiStaticPaths(
  moduleUrl = import.meta.url
): AdminUiStaticPaths {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const adminRoot = path.resolve(moduleDir, "..", "..", "admin");

  return {
    assetRoot: path.join(adminRoot, "assets"),
    indexFile: path.join(adminRoot, "index.html")
  };
}

export function createAdminUiIndexHandler(
  staticPaths: AdminUiStaticPaths
): RequestHandler {
  return (_request, response, next) => {
    setAdminUiNoStore(response);
    response.type("html");
    response.sendFile(staticPaths.indexFile, (error) => {
      if (error) {
        next(routeNotFoundError());
      }
    });
  };
}

export function createAdminUiAssetHandler(
  staticPaths: AdminUiStaticPaths
): RequestHandler {
  const staticHandler = express.static(staticPaths.assetRoot, {
    dotfiles: "deny",
    etag: false,
    extensions: false,
    fallthrough: true,
    immutable: false,
    index: false,
    lastModified: false,
    maxAge: 0,
    redirect: false,
    setHeaders(response) {
      setAdminUiNoStore(response);
    }
  });

  return (request, response, next) => {
    setAdminUiNoStore(response);

    if (request.method !== "GET" && request.method !== "HEAD") {
      next(routeNotFoundError());
      return;
    }
    if (hasDotPathSegment(request.path)) {
      next(routeNotFoundError());
      return;
    }

    staticHandler(request, response, () => {
      next(routeNotFoundError());
    });
  };
}

function hasDotPathSegment(requestPath: string): boolean {
  return requestPath
    .split("/")
    .filter(Boolean)
    .some((segment) => decodeURIComponent(segment).startsWith("."));
}

function routeNotFoundError(): AppError {
  return new AppError({
    code: "ROUTE_NOT_FOUND",
    message: "Route not found.",
    statusCode: 404
  });
}
