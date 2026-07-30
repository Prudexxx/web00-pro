import { Router } from "express";
import type { AppEnv } from "../../config/env.js";

export interface AppVersionInfo {
  branch?: string | null;
  commit?: string | null;
  version?: string | null;
}

export function createVersionRouter(options: {
  env: AppEnv;
  versionInfo?: AppVersionInfo;
}): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response
      .set("Cache-Control", "no-store")
      .json({
        data: {
          branch: sanitizeBranch(options.versionInfo?.branch),
          commit: sanitizeCommit(options.versionInfo?.commit),
          environment: options.env.NODE_ENV,
          service: options.env.SERVICE_NAME,
          version: sanitizeVersion(options.versionInfo?.version)
        }
      });
  });

  return router;
}

function sanitizeCommit(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function sanitizeBranch(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._/-]{1,120}$/.test(value)
    ? value
    : null;
}

function sanitizeVersion(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._+-]{1,80}$/.test(value)
    ? value
    : null;
}
