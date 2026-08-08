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
      primary: { enabled: false },
      shadow: { enabled: false }
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

    expect(config.shadow.enabled).toBe(true);
    if (!config.shadow.enabled) throw new Error("Expected enabled shadow config.");
    expect(config.shadow.storage.accessKeyId).toBe("tenant_id:key_id");
    expect(config.shadow.storage.prefix).toBe("canary/shadow");
  });

  it("accepts primary runtime/production while preserving shadow canary/shadow", () => {
    const config = parseCloudRuRuntimeEnv({
      ...enabledBaseEnv,
      CLOUDRU_RUNTIME_PRIMARY_PREFIX: "runtime/production",
      CLOUDRU_RUNTIME_SHADOW_PREFIX: "canary/shadow",
      WEB00_PUBLIC_RUNTIME_PRIMARY_ENABLED: "true",
      WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
    });

    expect(config.shadow.enabled).toBe(true);
    expect(config.primary.enabled).toBe(true);
    if (!config.shadow.enabled || !config.primary.enabled) {
      throw new Error("Expected both runtime targets enabled.");
    }
    expect(config.shadow.target.role).toBe("shadow");
    expect(config.shadow.storage.prefix).toBe("canary/shadow");
    expect(config.primary.target.role).toBe("primary");
    expect(config.primary.storage.prefix).toBe("runtime/production");
  });

  it("safely defaults enabled primary runtime to runtime/production without enabling shadow", () => {
    const config = parseCloudRuRuntimeEnv({
      ...enabledBaseEnv,
      CLOUDRU_RUNTIME_PREFIX: undefined,
      WEB00_PUBLIC_RUNTIME_PRIMARY_ENABLED: "true",
      WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "false"
    });

    expect(config.shadow.enabled).toBe(false);
    expect(config.primary.enabled).toBe(true);
    if (!config.primary.enabled) {
      throw new Error("Expected primary runtime enabled.");
    }
    expect(config.primary.storage.prefix).toBe("runtime/production");
    expect(config.primary.target.role).toBe("primary");
  });

  it("does not include credentials in the runtime target key", () => {
    const left = parseCloudRuRuntimeEnv({
      ...enabledBaseEnv,
      CLOUDRU_S3_SECRET_ACCESS_KEY: "first-redacted-runtime-placeholder"
    });
    const right = parseCloudRuRuntimeEnv({
      ...enabledBaseEnv,
      CLOUDRU_S3_SECRET_ACCESS_KEY: "second-redacted-runtime-placeholder"
    });

    expect(left.shadow.enabled && right.shadow.enabled).toBe(true);
    if (!left.shadow.enabled || !right.shadow.enabled) {
      throw new Error("Expected enabled shadow configs.");
    }
    expect(left.shadow.targetKey).toBe(right.shadow.targetKey);
    expect(left.shadow.targetKey).not.toMatch(/secret|redacted|access/i);
  });
});
