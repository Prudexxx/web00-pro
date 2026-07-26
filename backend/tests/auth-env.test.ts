import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { AuthEnvValidationError, parseAuthEnv } from "../src/config/auth-env.js";
import type { NodeEnvironment } from "../src/config/env.js";

const validSecret = Buffer.alloc(32, 1).toString("base64");
const otherValidSecret = Buffer.alloc(32, 2).toString("base64");

function validInput(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    JWT_ACCESS_SECRET_BASE64: validSecret,
    JWT_ISSUER: "web00-backend",
    JWT_AUDIENCE: "web00-admin",
    ACCESS_TOKEN_TTL_SECONDS: "900",
    REFRESH_TOKEN_TTL_SECONDS: "604800",
    AUTH_ORIGIN: "http://127.0.0.1:3000",
    AUTH_FINGERPRINT_SECRET_BASE64: otherValidSecret,
    TRUST_PROXY_HOPS: "0",
    ...overrides
  };
}

describe("parseAuthEnv", () => {
  it("parses the approved B4 auth environment contract", () => {
    const env = parseAuthEnv(validInput(), { nodeEnv: "test" });

    expect(env).toEqual({
      JWT_ACCESS_SECRET_BASE64: validSecret,
      JWT_ACCESS_SECRET: Buffer.from(validSecret, "base64"),
      JWT_ISSUER: "web00-backend",
      JWT_AUDIENCE: "web00-admin",
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
      AUTH_ORIGIN: "http://127.0.0.1:3000",
      AUTH_FINGERPRINT_SECRET_BASE64: otherValidSecret,
      AUTH_FINGERPRINT_SECRET: Buffer.from(otherValidSecret, "base64"),
      TRUST_PROXY_HOPS: 0
    });
  });

  it("rejects access secrets shorter than 32 bytes without exposing raw values", () => {
    const shortSecret = Buffer.alloc(31, 3).toString("base64");

    expect(() =>
      parseAuthEnv(validInput({ JWT_ACCESS_SECRET_BASE64: shortSecret }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);

    try {
      parseAuthEnv(validInput({ JWT_ACCESS_SECRET_BASE64: shortSecret }), { nodeEnv: "test" });
    } catch (error) {
      expect(String(error)).toContain("JWT_ACCESS_SECRET_BASE64");
      expect(String(error)).not.toContain(shortSecret);
    }
  });

  it("rejects reused access and fingerprint secrets", () => {
    expect(() =>
      parseAuthEnv(
        validInput({
          AUTH_FINGERPRINT_SECRET_BASE64: validSecret
        }),
        { nodeEnv: "test" }
      )
    ).toThrow(AuthEnvValidationError);
  });

  it("requires approved issuer and audience values", () => {
    expect(() =>
      parseAuthEnv(validInput({ JWT_ISSUER: "wrong-issuer" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ JWT_AUDIENCE: "wrong-audience" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
  });

  it("rejects unsafe TTL and trust proxy values", () => {
    expect(() =>
      parseAuthEnv(validInput({ ACCESS_TOKEN_TTL_SECONDS: "0" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ REFRESH_TOKEN_TTL_SECONDS: "900" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ TRUST_PROXY_HOPS: "4" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ TRUST_PROXY_HOPS: "true" }), { nodeEnv: "test" })
    ).toThrow(AuthEnvValidationError);
  });

  it("trims AUTH_ORIGIN and allows it to be omitted outside production", () => {
    expect(
      parseAuthEnv(validInput({ AUTH_ORIGIN: " http://127.0.0.1:3000 " }), {
        nodeEnv: "development"
      })
        .AUTH_ORIGIN
    ).toBe("http://127.0.0.1:3000");

    const env = parseAuthEnv(validInput({ AUTH_ORIGIN: undefined }), {
      nodeEnv: "test"
    });

    expect(env.AUTH_ORIGIN).toBeUndefined();
  });

  it("requires production AUTH_ORIGIN to be an exact HTTPS origin", () => {
    const rejectedOrigins = [
      undefined,
      "",
      "*",
      "http://admin.example.com",
      "https://user:pass@admin.example.com",
      "https://admin.example.com/login",
      "https://admin.example.com/login/..",
      "https://admin.example.com/%2e%2e",
      "https://admin.example.com/.",
      "https://admin.example.com?next=/admin",
      "https://admin.example.com#login"
    ];

    for (const AUTH_ORIGIN of rejectedOrigins) {
      expect(() =>
        parseAuthEnv(validInput({ AUTH_ORIGIN }), { nodeEnv: "production" })
      ).toThrow(AuthEnvValidationError);
    }

    expect(
      parseAuthEnv(validInput({ AUTH_ORIGIN: "https://admin.example.com" }), {
        nodeEnv: "production"
      }).AUTH_ORIGIN
    ).toBe("https://admin.example.com");
  });

  it("normalizes production AUTH_ORIGIN trailing slash", () => {
    expect(
      parseAuthEnv(validInput({ AUTH_ORIGIN: "https://admin.example.com/" }), {
        nodeEnv: "production"
      }).AUTH_ORIGIN
    ).toBe("https://admin.example.com");
  });

  it("allows localhost HTTP only outside production", () => {
    const nonProductionNodeEnvs: NodeEnvironment[] = ["development", "test"];

    for (const nodeEnv of nonProductionNodeEnvs) {
      expect(
        parseAuthEnv(validInput({ AUTH_ORIGIN: "http://localhost:3000" }), {
          nodeEnv
        }).AUTH_ORIGIN
      ).toBe("http://localhost:3000");
    }

    expect(() =>
      parseAuthEnv(validInput({ AUTH_ORIGIN: "http://admin.example.com" }), {
        nodeEnv: "development"
      })
    ).toThrow(AuthEnvValidationError);
  });

  it("does not expose raw AUTH_ORIGIN values in validation errors", () => {
    const rawOrigin = "https://user:secret@admin.example.com/login?token=secret#fragment";

    try {
      parseAuthEnv(validInput({ AUTH_ORIGIN: rawOrigin }), {
        nodeEnv: "production"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthEnvValidationError);
      expect(String(error)).toContain("AUTH_ORIGIN");
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain("admin.example.com/login");
    }
  });
});
