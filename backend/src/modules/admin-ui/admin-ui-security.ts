import type { RequestHandler, Response } from "express";
import helmet from "helmet";
import type { NodeEnvironment } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

export interface AdminUiSecurityOptions {
  catalogPublicOrigin: string;
  nodeEnv: NodeEnvironment;
  storagePublicOrigin: string;
}

const maxImageOriginLength = 2048;

const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "interest-cohort=()"
].join(", ");

export function createAdminUiSecurityMiddleware(
  options: AdminUiSecurityOptions
): RequestHandler {
  const storageOrigin = parseStorageOrigin(options.storagePublicOrigin, options.nodeEnv);
  const catalogOrigin = parseCatalogOrigin(options.catalogPublicOrigin, options.nodeEnv);
  const securityHeaders = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: uniqueSources(["'self'", "data:", "blob:", storageOrigin, catalogOrigin]),
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(options.nodeEnv === "production" ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
    strictTransportSecurity:
      options.nodeEnv === "production"
        ? { includeSubDomains: true, maxAge: 15_552_000 }
        : false,
    xContentTypeOptions: true,
    xFrameOptions: { action: "deny" },
    xPoweredBy: false
  });

  return (request, response, next) => {
    setAdminUiNoStore(response);
    response.setHeader("Permissions-Policy", permissionsPolicy);
    securityHeaders(request, response, next);
  };
}

export function setAdminUiNoStore(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
}

function parseStorageOrigin(value: string, nodeEnv: NodeEnvironment): string {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    if (nodeEnv === "production" && parsed.protocol !== "https:") {
      throw new Error("invalid production protocol");
    }

    return parsed.origin;
  } catch {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "Invalid Admin UI storage image origin.",
      statusCode: 500
    });
  }
}

function parseCatalogOrigin(value: string, nodeEnv: NodeEnvironment): string {
  try {
    if (typeof value !== "string" || value.length === 0 || value.length > maxImageOriginLength) {
      throw new Error("invalid length");
    }

    const parsed = new URL(value);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    if (nodeEnv === "production" && parsed.protocol !== "https:") {
      throw new Error("invalid production protocol");
    }
    if (
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("invalid origin shape");
    }
    if (value !== parsed.origin && value !== `${parsed.origin}/`) {
      throw new Error("invalid canonical origin");
    }

    return parsed.origin;
  } catch {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "Invalid Admin UI catalog image origin.",
      statusCode: 500
    });
  }
}

function uniqueSources(sources: string[]): string[] {
  return [...new Set(sources)];
}
