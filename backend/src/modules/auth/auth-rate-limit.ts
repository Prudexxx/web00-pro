import { createHash } from "node:crypto";
import { MemoryStore, ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import { normalizeEmail } from "./auth.schemas.js";

export interface LoginRateLimitKeyInput {
  email: string;
  ip: string | undefined;
}

export function createLoginRateLimitKey(input: LoginRateLimitKeyInput): string {
  const ipKey = ipKeyGenerator(input.ip ?? "", 56);
  const emailHash = createHash("sha256")
    .update(normalizeEmail(input.email), "utf8")
    .digest("hex");

  return `login:${ipKey}:${emailHash}`;
}

export function createLoginRateLimiter(): RequestHandler {
  return rateLimit({
    keyGenerator: (request) => {
      const ipKey = ipKeyGenerator(request.ip ?? "", 56);

      return formatLoginRateLimitKey(ipKey, readEmailFromBody(request.body));
    },
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(rateLimited());
    },
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    store: new MemoryStore(),
    windowMs: 15 * 60 * 1000
  });
}

export function createRefreshRateLimiter(): RequestHandler {
  return rateLimit({
    keyGenerator: (request) => ipKeyGenerator(request.ip ?? "", 56),
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(rateLimited());
    },
    limit: 30,
    standardHeaders: "draft-8",
    store: new MemoryStore(),
    windowMs: 15 * 60 * 1000
  });
}

function formatLoginRateLimitKey(ipKey: string, email: string): string {
  const emailHash = createHash("sha256")
    .update(normalizeEmail(email), "utf8")
    .digest("hex");

  return `login:${ipKey}:${emailHash}`;
}

function readEmailFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return "";
  }

  const email = (body as { email?: unknown }).email;

  return typeof email === "string" ? email : "";
}

function rateLimited(): AppError {
  return new AppError({
    code: "RATE_LIMITED",
    message: "Too many requests.",
    statusCode: 429
  });
}
