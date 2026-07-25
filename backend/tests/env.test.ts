import { describe, expect, it } from "vitest";
import { EnvironmentValidationError, parseEnv } from "../src/config/env.js";

describe("parseEnv", () => {
  it("parses a valid B1 environment", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      PORT: "3000",
      LOG_LEVEL: "silent",
      SERVICE_NAME: "web00-backend"
    });

    expect(env).toEqual({
      NODE_ENV: "test",
      PORT: 3000,
      LOG_LEVEL: "silent",
      SERVICE_NAME: "web00-backend"
    });
  });

  it("uses safe defaults outside production", () => {
    const env = parseEnv({});

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.SERVICE_NAME).toBe("web00-backend");
  });

  it("rejects an invalid PORT without exposing the raw value", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "test",
        PORT: "secret-token-port",
        LOG_LEVEL: "silent",
        SERVICE_NAME: "web00-backend"
      })
    ).toThrow(EnvironmentValidationError);

    try {
      parseEnv({
        NODE_ENV: "test",
        PORT: "secret-token-port",
        LOG_LEVEL: "silent",
        SERVICE_NAME: "web00-backend"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect(String(error)).toContain("PORT");
      expect(String(error)).not.toContain("secret-token-port");
    }
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "local",
        PORT: "3000",
        LOG_LEVEL: "silent",
        SERVICE_NAME: "web00-backend"
      })
    ).toThrow(EnvironmentValidationError);
  });

  it("requires PORT in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        SERVICE_NAME: "web00-backend"
      })
    ).toThrow(EnvironmentValidationError);
  });
});
