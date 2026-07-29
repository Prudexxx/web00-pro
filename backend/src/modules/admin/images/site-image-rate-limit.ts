import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";

export function createSiteImageUploadRateLimit(options: {
  max: number;
  windowMs: number;
}) {
  return rateLimit({
    keyGenerator: (request: Request) => {
      const principal = (request as AuthRequest).auth;
      const ip = request.ip ?? "127.0.0.1";

      return `${principal?.id ?? "anonymous"}:${ipKeyGenerator(ip)}`;
    },
    legacyHeaders: false,
    max: options.max,
    standardHeaders: true,
    windowMs: options.windowMs
  });
}
