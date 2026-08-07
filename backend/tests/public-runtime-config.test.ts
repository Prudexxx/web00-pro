import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { parseCloudRuRuntimeEnv } from "../src/config/cloudru-runtime-env.js";

const enabledBaseEnv = {
  CLOUDRU_PUBLIC_BASE_URL: "https://web00-public-runtime.s3-website.cloud.ru",
  CLOUDRU_RUNTIME_PREFIX: "canary/shadow",
  CLOUDRU_S3_ACCESS_KEY_ID: "tenant_id:key_id",
  CLOUDRU_S3_BUCKET: "web00-public-runtime",
  CLOUDRU_S3_ENDPOINT: "https://s3.cloud.ru",
  CLOUDRU_S3_REGION: "ru-central-1",
  CLOUDRU_S3_SECRET_ACCESS_KEY: "redacted-runtime-placeholder",
  WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
};

describe("Cloud.ru public runtime env", () => {
  it("keeps shadow runtime disabled by default without Cloud.ru variables", () => {
    const config = parseCloudRuRuntimeEnv({});

    expect(config).toEqual({
      enabled: false
    });
  });

  it("requires Cloud.ru settings only when shadow runtime is enabled", () => {
    expect(() =>
      parseCloudRuRuntimeEnv({
        WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
      })
    ).toThrow(AppError);

    try {
      parseCloudRuRuntimeEnv({
        WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "CONFIGURATION_ERROR",
        statusCode: 503
      });
    }
  });

  it("never leaks configured secret values through safe config errors", () => {
    try {
      parseCloudRuRuntimeEnv({
        ...enabledBaseEnv,
        CLOUDRU_PUBLIC_BASE_URL: "javascript:alert(1)"
      });
    } catch (error) {
      const serialized = JSON.stringify(error);

      expect(serialized).not.toContain(enabledBaseEnv.CLOUDRU_S3_SECRET_ACCESS_KEY);
      expect(serialized).not.toContain(enabledBaseEnv.CLOUDRU_S3_ACCESS_KEY_ID);
      expect(serialized).not.toContain("javascript:alert(1)");
      expect(error).toMatchObject({ code: "CONFIGURATION_ERROR" });
      return;
    }

    throw new Error("Expected invalid config to throw.");
  });

  it("preserves the complete Cloud.ru access key id without reconstruction", () => {
    const config = parseCloudRuRuntimeEnv(enabledBaseEnv);

    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("Expected enabled config.");
    expect(config.storage.accessKeyId).toBe("tenant_id:key_id");
    expect(config.storage.prefix).toBe("canary/shadow");
  });
});
