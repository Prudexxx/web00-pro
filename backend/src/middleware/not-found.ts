import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

export function notFoundMiddleware(
  _request: Request,
  _response: Response,
  next: NextFunction
): void {
  next(
    new AppError({
      code: "ROUTE_NOT_FOUND",
      message: "Route not found.",
      statusCode: 404
    })
  );
}
