import "dotenv/config";

import { afterEach, beforeEach } from "vitest";

const mutableEnvKeys = [
  "NODE_ENV",
  "PORT",
  "LOG_LEVEL",
  "SERVICE_NAME",
  "DATABASE_URL",
  "SHADOW_DATABASE_URL",
  "TEST_DATABASE_URL"
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
