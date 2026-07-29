import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const requestIdHeaderName = "X-Request-Id";
const requestIdPattern = /^[A-Za-z0-9_.:-]{1,80}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function selectRequestId(value: unknown): string {
  if (isValidRequestId(value)) {
    return value;
  }

  return createRequestId();
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const requestId = selectRequestId(request.get(requestIdHeaderName));

  response.locals.requestId = requestId;
  response.setHeader(requestIdHeaderName, requestId);
  next();
}
