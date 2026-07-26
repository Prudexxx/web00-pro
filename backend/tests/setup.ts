import "dotenv/config";

import { afterEach, beforeEach } from "vitest";

const mutableEnvKeys = [
  "NODE_ENV",
  "PORT",
  "LOG_LEVEL",
  "SERVICE_NAME",
  "DATABASE_URL",
  "SHADOW_DATABASE_URL",
  "TEST_DATABASE_URL",
  "JWT_ACCESS_SECRET_BASE64",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "ACCESS_TOKEN_TTL_SECONDS",
  "REFRESH_TOKEN_TTL_SECONDS",
  "AUTH_ORIGIN",
  "PUBLIC_CORS_ORIGINS",
  "AUTH_FINGERPRINT_SECRET_BASE64",
  "TRUST_PROXY_HOPS",
  "STORAGE_PUBLIC_BASE_URL",
  "STORAGE_WORKER_ENABLED",
  "STORAGE_WORKER_POLL_INTERVAL_SECONDS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_URL"
] as const;
const originalValues = new Map<string, string | undefined>();

beforeEach(() => {
  originalValues.clear();

  for (const key of mutableEnvKeys) {
    originalValues.set(key, process.env[key]);
  }

  process.env.NODE_ENV = "test";
  process.env.PORT = "3000";
  process.env.LOG_LEVEL = "silent";
  process.env.SERVICE_NAME = "web00-backend";
});

afterEach(() => {
  for (const key of mutableEnvKeys) {
    const originalValue = originalValues.get(key);

    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }

  originalValues.clear();
});
