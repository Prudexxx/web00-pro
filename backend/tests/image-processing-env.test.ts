import { describe, expect, it } from "vitest";
import {
  ImageProcessingEnvValidationError,
  parseImageProcessingEnv,
  toImageProcessingConfig
} from "../src/config/image-processing-env.js";

describe("parseImageProcessingEnv", () => {
  it("uses weak CPU defaults for image processing when env is absent", () => {
    const env = parseImageProcessingEnv({});

    expect(env).toEqual({
      IMAGE_PROCESSING_CONCURRENCY: 1,
      IMAGE_PROCESSING_MAX_PIXELS: 16_000_000,
      IMAGE_PROCESSING_MAX_QUEUE: 2,
      IMAGE_PROCESSING_QUEUE_WAIT_MS: 5_000,
      IMAGE_PROCESSING_TIMEOUT_MS: 90_000
    });
    expect(toImageProcessingConfig(env)).toEqual({
      maxConcurrency: 1,
      maxPixels: 16_000_000,
      maxQueued: 2,
      queueWaitTimeoutMs: 5_000,
      timeoutMs: 90_000
    });
  });

  it("accepts explicit bounded non-secret image processing values", () => {
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

  it("rejects unsafe image processing env values without leaking raw values", () => {
    const unsafeValue = "45000; DATABASE_URL=postgresql://secret";

    expect(() =>
      parseImageProcessingEnv({
        IMAGE_PROCESSING_CONCURRENCY: "4"
      })
    ).toThrow(ImageProcessingEnvValidationError);
    expect(() =>
      parseImageProcessingEnv({
        IMAGE_PROCESSING_MAX_PIXELS: "40000001"
      })
    ).toThrow(ImageProcessingEnvValidationError);
    expect(() =>
      parseImageProcessingEnv({
        IMAGE_PROCESSING_MAX_QUEUE: "5"
      })
    ).toThrow(ImageProcessingEnvValidationError);
    expect(() =>
      parseImageProcessingEnv({
        IMAGE_PROCESSING_QUEUE_WAIT_MS: "0"
      })
    ).toThrow(ImageProcessingEnvValidationError);

    try {
      parseImageProcessingEnv({ IMAGE_PROCESSING_TIMEOUT_MS: unsafeValue });
    } catch (error) {
      expect(error).toBeInstanceOf(ImageProcessingEnvValidationError);
      const validationError = error as ImageProcessingEnvValidationError;

      expect(validationError.issues[0]?.message).toContain("60000 and 110000");
      expect(validationError.issues[0]?.message).not.toContain("170000");
      expect(String(error)).toContain("IMAGE_PROCESSING_TIMEOUT_MS");
      expect(String(error)).not.toContain(unsafeValue);
      expect(String(error)).not.toContain("postgresql://secret");
      return;
    }

    throw new Error("expected image processing env validation to fail");
  });
});
