import { describe, expect, it } from "vitest";
import {
  parseStorageEnv,
  StorageEnvValidationError,
  toStorageConfig
} from "../src/config/storage-env.js";

function validInput(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test",
    STORAGE_WORKER_ENABLED: "false",
    STORAGE_WORKER_POLL_INTERVAL_SECONDS: "60",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
    SUPABASE_STORAGE_BUCKET: "web00-catalog-images",
    SUPABASE_URL: "https://project.supabase.co",
    ...overrides
  };
}

describe("parseStorageEnv", () => {
  it("parses the approved B7 storage environment contract", () => {
    const env = parseStorageEnv(validInput());

    expect(env).toEqual({
      STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test",
      STORAGE_WORKER_ENABLED: false,
      STORAGE_WORKER_POLL_INTERVAL_SECONDS: 60,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      SUPABASE_STORAGE_BUCKET: "web00-catalog-images",
      SUPABASE_URL: "https://project.supabase.co"
    });
    expect(toStorageConfig(env)).toEqual({
      bucket: "web00-catalog-images",
      credentials: {
        serviceRoleKey: "service-role-secret-value",
        supabaseUrl: "https://project.supabase.co"
      },
      publicBaseUrl: "https://cdn.example.test",
      workerEnabled: false,
      workerPollIntervalSeconds: 60
    });
  });

  it("requires the canonical bucket and poll interval", () => {
    expect(() =>
      parseStorageEnv(
        validInput({
          STORAGE_WORKER_POLL_INTERVAL_SECONDS: "30",
          SUPABASE_STORAGE_BUCKET: "other-bucket"
        })
      )
    ).toThrow(StorageEnvValidationError);
  });

  it("parses only explicit boolean worker flags", () => {
    expect(parseStorageEnv(validInput({ STORAGE_WORKER_ENABLED: "true" })).STORAGE_WORKER_ENABLED).toBe(
      true
    );
    expect(() =>
      parseStorageEnv(validInput({ STORAGE_WORKER_ENABLED: "yes" }))
    ).toThrow(StorageEnvValidationError);
  });

  it("reports only safe variable names without raw secret or URL values", () => {
    const secret = "raw-service-role-secret";
    const rawUrl = "https://project.supabase.co/unsafe-path";

    try {
      parseStorageEnv(
        validInput({
          STORAGE_PUBLIC_BASE_URL: rawUrl,
          STORAGE_WORKER_ENABLED: "sometimes",
          SUPABASE_SERVICE_ROLE_KEY: secret,
          SUPABASE_URL: rawUrl
        })
      );
    } catch (error) {
      expect(error).toBeInstanceOf(StorageEnvValidationError);
      expect(String(error)).toContain("STORAGE_PUBLIC_BASE_URL");
      expect(String(error)).toContain("STORAGE_WORKER_ENABLED");
      expect(String(error)).toContain("SUPABASE_URL");
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(rawUrl);
      return;
    }

    throw new Error("expected parseStorageEnv to reject invalid storage env");
  });
});
