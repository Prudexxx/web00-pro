import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "../config/env.js";

export interface RequestLogEntry {
  durationMs: number;
  environment: AppEnv["NODE_ENV"];
  level: "info";
  method: string;
  path: string;
  requestId: string;
  service: string;
  statusCode: number;
  time: string;
}

export interface LifecycleLogEntry {
  environment: AppEnv["NODE_ENV"];
  event: string;
  level: "info" | "error";
  service: string;
  time: string;
}

export interface AuthSecurityLogEntry {
  emailHash?: string;
  environment: AppEnv["NODE_ENV"] | string;
  event: "auth.login.failed";
  level: "warn";
  requestId: string;
  service: string;
  time: string;
}

export type AppLogEntry = AuthSecurityLogEntry | LifecycleLogEntry | RequestLogEntry;

export interface AppLogger {
  log(entry: AppLogEntry): void;
}

export interface CreateLoggerOptions {
  env: AppEnv;
  write?: (line: string) => void;
}

export interface RequestLoggerOptions {
  env: AppEnv;
  logger: AppLogger;
  now: () => Date;
}

export function createLogger(options: CreateLoggerOptions): AppLogger {
  const write = options.write ?? ((line: string) => console.log(line));

  return {
    log: (entry) => {
      if (options.env.LOG_LEVEL === "silent") {
        return;
      }

      write(JSON.stringify(entry));
    }
  };
}

export function requestLogger(options: RequestLoggerOptions) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    response.on("finish", () => {
      options.logger.log({
        durationMs: Math.max(0, Date.now() - startedAt),
        environment: options.env.NODE_ENV,
        level: "info",
        method: request.method,
        path: request.path,
        requestId: getRequestIdFromLocals(response),
        service: options.env.SERVICE_NAME,
        statusCode: response.statusCode,
        time: options.now().toISOString()
      });
    });

    next();
  };
}

function getRequestIdFromLocals(response: Response): string {
  const requestId = response.locals.requestId;

  if (typeof requestId === "string" && requestId.length > 0) {
    return requestId;
  }

  return "unknown";
}
