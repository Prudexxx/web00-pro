import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NodeEnvironment } from "../src/config/env.js";
import {
  PublicCorsEnvValidationError,
  parsePublicCorsEnv,
  toPublicCorsConfig
} from "../src/config/public-cors-env.js";

function parse(
  value: string | undefined,
  nodeEnv: NodeEnvironment = "production"
) {
  return parsePublicCorsEnv(
    value === undefined ? {} : { PUBLIC_CORS_ORIGINS: value },
    { nodeEnv }
  );
}

describe("parsePublicCorsEnv", () => {
  it("requires at least one production origin", () => {
    expect(() => parse(undefined, "production")).toThrow(PublicCorsEnvValidationError);
    expect(() => parse("", "production")).toThrow(PublicCorsEnvValidationError);
  });

  it("parses one or more exact HTTPS origins", () => {
    expect(parse("https://web00.example.com")).toEqual({
      PUBLIC_CORS_ORIGINS: ["https://web00.example.com"]
    });
    expect(
      parse("https://web00.example.com,https://www.web00.example.com")
    ).toEqual({
      PUBLIC_CORS_ORIGINS: [
        "https://web00.example.com",
        "https://www.web00.example.com"
      ]
    });
  });

  it("trims, normalizes, and deduplicates origins", () => {
    expect(
      parse(" https://web00.example.com/ , https://web00.example.com ")
    ).toEqual({
      PUBLIC_CORS_ORIGINS: ["https://web00.example.com"]
    });
  });

  it("allows up to ten origins and rejects eleven", () => {
    const tenOrigins = Array.from(
      { length: 10 },
      (_, index) => `https://site-${index}.example.com`
    );
    const elevenOrigins = [
      ...tenOrigins,
      "https://site-10.example.com"
    ];

    expect(parse(tenOrigins.join(",")).PUBLIC_CORS_ORIGINS).toHaveLength(10);
    expect(() => parse(elevenOrigins.join(","))).toThrow(PublicCorsEnvValidationError);
  });

  it("rejects wildcard, credentials, query, fragment, and non-root path", () => {
    const rejected = [
      "*",
      "https://*.example.com",
      "https://user:pass@web00.example.com",
      "https://web00.example.com?token=secret",
      "https://web00.example.com#fragment",
      "https://web00.example.com/catalog",
      "https://web00.example.com/catalog/..",
      "https://web00.example.com/%2e%2e",
      "https://web00.example.com/."
    ];

    for (const value of rejected) {
      expect(() => parse(value)).toThrow(PublicCorsEnvValidationError);
    }
  });

  it("rejects HTTP in production and allows localhost HTTP outside production", () => {
    expect(() => parse("http://web00.example.com", "production")).toThrow(
      PublicCorsEnvValidationError
    );
    expect(parse("http://localhost:3000", "development")).toEqual({
      PUBLIC_CORS_ORIGINS: ["http://localhost:3000"]
    });
    expect(parse("http://127.0.0.1:3000", "test")).toEqual({
      PUBLIC_CORS_ORIGINS: ["http://127.0.0.1:3000"]
    });
  });

  it("allows an empty list outside production", () => {
    expect(parse(undefined, "development")).toEqual({
      PUBLIC_CORS_ORIGINS: []
    });
    expect(parse("", "test")).toEqual({
      PUBLIC_CORS_ORIGINS: []
    });
  });

  it("converts parsed env to typed public CORS config", () => {
    const config = toPublicCorsConfig(parse("https://web00.example.com"));

    expect(config.allowedMethods).toEqual(["GET", "HEAD", "OPTIONS"]);
    expect(config.allowedOrigins.has("https://web00.example.com")).toBe(true);
    expect(config.maxOrigins).toBe(10);
  });

  it("reports only safe variable names without raw origin values", () => {
    const rawOrigin = "https://user:secret@web00.example.com/private?token=secret";

    try {
      parse(rawOrigin);
    } catch (error) {
      expect(error).toBeInstanceOf(PublicCorsEnvValidationError);
      expect(String(error)).toContain("PUBLIC_CORS_ORIGINS");
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain("web00.example.com/private");
      return;
    }

    throw new Error("expected parsePublicCorsEnv to reject invalid origin");
  });

  it("preserves PUBLIC_CORS_ORIGINS between tests", () => {
    const setupSource = readFileSync(join(process.cwd(), "tests", "setup.ts"), "utf8");

    expect(setupSource).toContain('"PUBLIC_CORS_ORIGINS"');
  });
});
