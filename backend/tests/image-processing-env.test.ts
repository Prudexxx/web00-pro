import { describe, expect, it } from "vitest";
import {
  IMAGE_PROCESSING_CONCURRENCY_LIMITS,
  IMAGE_PROCESSING_TIMEOUT_LIMITS,
  ImageProcessingEnvValidationError,
  parseImageProcessingEnv,
  toImageProcessingConfig
} from "../src/config/image-processing-env.js";

describe("parseImageProcessingEnv", () => {
  it("uses production-safe bounded defaults for weak CPU image processing", () => {
    const env = parseImageProcessingEnv({});

    expect(env).toEqual({
      IMAGE_PROCESSING_CONCURRENCY: IMAGE_PROCESSING_CONCURRENCY_LIMITS.default,
      IMAGE_PROCESSING_MAX_PIXELS: 16_000_000,
      IMAGE_PROCESSING_MAX_QUEUE: 2,
      IMAGE_PROCESSING_QUEUE_WAIT_MS: 5_000,
      IMAGE_PROCESSING_TIMEOUT_MS: IMAGE_PROCESSING_TIMEOUT_LIMITS.default
    });
    expect(env.IMAGE_PROCESSING_CONCURRENCY).toBe(1);
    expect(env.IMAGE_PROCESSING_TIMEOUT_MS).toBeGreaterThan(45_000);
    expect(env.IMAGE_PROCESSING_TIMEOUT_MS).toBeLessThan(120_000);
    expect(toImageProcessingConfig(env)).toEqual({
      maxConcurrency: IMAGE_PROCESSING_CONCURRENCY_LIMITS.default,
      maxPixels: 16_000_000,
      maxQueued: 2,
      queueWaitTimeoutMs: 5_000,
      timeoutMs: IMAGE_PROCESSING_TIMEOUT_LIMITS.default
    });
  });

  it("accepts explicit bounded non-secret timeout and concurrency values", () => {
    const env = parseImageProcessingEnv({
      IMAGE_PROCESSING_CONCURRENCY: "1",
      IMAGE_PROCESSING_MAX_PIXELS: "12000000",
      IMAGE_PROCESSING_MAX_QUEUE: "1",
      IMAGE_PROCESSING_QUEUE_WAIT_MS: "3000",
      IMAGE_PROCESSING_TIMEOUT_MS: "90000"
    });

    expect(toImageProcessingConfig(env)).toEqual({
      maxConcurrency: 1,
      maxPixels: 12_000_000,
      maxQueued: 1,
      queueWaitTimeoutMs: 3_000,
      timeoutMs: 90_000
    });
  });

  it("rejects timeout values below min, above max, or non-integer", () => {
    for (const value of [
      String(IMAGE_PROCESSING_TIMEOUT_LIMITS.min - 1),
      String(IMAGE_PROCESSING_TIMEOUT_LIMITS.max + 1),
      "120000.5",
      "not-a-number"
    ]) {
      expect(() =>
        parseImageProcessingEnv({ IMAGE_PROCESSING_TIMEOUT_MS: value })
      ).toThrow(ImageProcessingEnvValidationError);
    }
  });

  it("rejects unbounded image concurrency", () => {
    for (const value of ["0", "2", "3", "1.5", "many"]) {
      expect(() =>
        parseImageProcessingEnv({ IMAGE_PROCESSING_CONCURRENCY: value })
      ).toThrow(ImageProcessingEnvValidationError);
    }
  });

  it("rejects unbounded image memory and admission queue settings", () => {
    for (const input of [
      { IMAGE_PROCESSING_MAX_PIXELS: "40000001" },
      { IMAGE_PROCESSING_MAX_PIXELS: "999999" },
      { IMAGE_PROCESSING_MAX_QUEUE: "999" },
      { IMAGE_PROCESSING_MAX_QUEUE: "-1" },
      { IMAGE_PROCESSING_QUEUE_WAIT_MS: "0" },
      { IMAGE_PROCESSING_QUEUE_WAIT_MS: "60001" }
    ]) {
      expect(() => parseImageProcessingEnv(input)).toThrow(ImageProcessingEnvValidationError);
    }
  });

  it("reports only safe variable names when image processing env is invalid", () => {
    const rawValue = "120000; DATABASE_URL=postgresql://secret";

    try {
      parseImageProcessingEnv({ IMAGE_PROCESSING_TIMEOUT_MS: rawValue });
    } catch (error) {
      expect(error).toBeInstanceOf(ImageProcessingEnvValidationError);
      expect(String(error)).toContain("IMAGE_PROCESSING_TIMEOUT_MS");
      expect(String(error)).not.toContain(rawValue);
      expect(String(error)).not.toContain("postgresql://secret");
      return;
    }

    throw new Error("expected image processing env validation to fail");
  });
});
