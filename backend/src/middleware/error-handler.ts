import type { NextFunction, Request, Response } from "express";
import { createErrorResponse, toAppError } from "../lib/errors.js";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);
  const requestId = getRequestIdFromLocals(response);

  response.status(appError.statusCode).json(createErrorResponse(appError, requestId));
}

function getRequestIdFromLocals(response: Response): string {
  const requestId = response.locals.requestId;

  if (typeof requestId === "string" && requestId.length > 0) {
    return requestId;
  }

  return "unknown";
}
