import type { RequestHandler, Response } from "express";
import helmet from "helmet";
import type { NodeEnvironment } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

export interface AdminUiSecurityOptions {
  nodeEnv: NodeEnvironment;
  storagePublicOrigin: string;
}

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
  const securityHeaders = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", storageOrigin],
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
