import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { AuthEnvValidationError, parseAuthEnv } from "../src/config/auth-env.js";

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
    const env = parseAuthEnv(validInput());

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
      parseAuthEnv(validInput({ JWT_ACCESS_SECRET_BASE64: shortSecret }))
    ).toThrow(AuthEnvValidationError);

    try {
      parseAuthEnv(validInput({ JWT_ACCESS_SECRET_BASE64: shortSecret }));
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
        })
      )
    ).toThrow(AuthEnvValidationError);
  });

  it("requires approved issuer and audience values", () => {
    expect(() =>
      parseAuthEnv(validInput({ JWT_ISSUER: "wrong-issuer" }))
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ JWT_AUDIENCE: "wrong-audience" }))
    ).toThrow(AuthEnvValidationError);
  });

  it("rejects unsafe TTL and trust proxy values", () => {
    expect(() =>
      parseAuthEnv(validInput({ ACCESS_TOKEN_TTL_SECONDS: "0" }))
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ REFRESH_TOKEN_TTL_SECONDS: "900" }))
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ TRUST_PROXY_HOPS: "4" }))
    ).toThrow(AuthEnvValidationError);
    expect(() =>
      parseAuthEnv(validInput({ TRUST_PROXY_HOPS: "true" }))
    ).toThrow(AuthEnvValidationError);
  });

  it("trims AUTH_ORIGIN and allows it to be omitted", () => {
    expect(
      parseAuthEnv(validInput({ AUTH_ORIGIN: " http://127.0.0.1:3000 " }))
        .AUTH_ORIGIN
    ).toBe("http://127.0.0.1:3000");

    const env = parseAuthEnv(validInput({ AUTH_ORIGIN: undefined }));

    expect(env.AUTH_ORIGIN).toBeUndefined();
  });
});
