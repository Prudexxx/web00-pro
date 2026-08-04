import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createSharpImageProcessor } from "../src/modules/images/image-processor.js";
import { createImagePipelineSemaphore } from "../src/modules/images/image-semaphore.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

async function fixture(
  format: "avif" | "jpeg" | "png" | "webp",
  options: { alpha?: number; height?: number; width?: number } = {}
): Promise<Buffer> {
  const image = sharp({
    create: {
      background: {
        alpha: options.alpha ?? 1,
        b: 32,
        g: 64,
        r: 128
      },
      channels: options.alpha === undefined ? 3 : 4,
      height: options.height ?? 8,
      width: options.width ?? 12
    }
  });

  if (format === "jpeg") {
    return image.jpeg().toBuffer();
  }
  if (format === "png") {
    return image.png().toBuffer();
  }
  if (format === "webp") {
    return image.webp().toBuffer();
  }

  return image.avif().toBuffer();
}

describe("createSharpImageProcessor", () => {
  it("uses the benchmark-selected 16 MiB Sharp memory cache profile", () => {
    createSharpImageProcessor();

    expect(sharp.cache().memory.max).toBe(16);
  });

  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["avif", "image/avif"]
  ] as const)("accepts %s input and emits clean WebP and AVIF derivatives", async (format, mime) => {
    const processor = createSharpImageProcessor();
    const source = await fixture(format, { width: 1200, height: 600 });

    const processed = await processor.process({
      assetId,
      declaredMimeType: mime,
      siteId,
      slot: "preview",
      source
    });

    expect(processed.widths).toEqual([480, 960, 1200]);
    expect(processed.variants).toHaveLength(6);
    expect(processed.variants.map((variant) => variant.format).sort()).toEqual([
      "avif",
      "avif",
      "avif",
      "webp",
      "webp",
      "webp"
    ]);
    expect(processed.variants.every((variant) => variant.width <= 1200)).toBe(true);
    expect(processed.variants.every((variant) => variant.path.includes(assetId))).toBe(
      true
    );

    for (const variant of processed.variants) {
      const metadata = await sharp(variant.body).metadata();

      expect(metadata.width).toBe(variant.width);
      expect(metadata.mediaType).toBe(variant.contentType);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(variant.body.includes(Buffer.from("SOURCE_SECRET"))).toBe(false);
    }
  }, 15_000);

  it("emits sourceSha256 from the exact input bytes before variant processing", async () => {
    const processor = createSharpImageProcessor();
    const source = await fixture("png", { width: 640, height: 320 });

    const processed = await processor.process({
      assetId,
      declaredMimeType: "image/png",
      siteId,
      slot: "preview",
      source
    });

    expect(processed.sourceSha256).toBe(
      createHash("sha256").update(source).digest("hex")
    );
    expect(processed.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves alpha while avoiding enlargement", async () => {
    const processor = createSharpImageProcessor();
    const source = await fixture("png", { alpha: 0.4, width: 320, height: 160 });

    const processed = await processor.process({
      assetId,
      declaredMimeType: "image/png",
      siteId,
      slot: "gallery",
      source
    });

    expect(processed.widths).toEqual([320]);
    for (const variant of processed.variants) {
      const metadata = await sharp(variant.body).metadata();

      expect(metadata.width).toBe(320);
      expect(metadata.hasAlpha).toBe(true);
    }
  });

  it("normalizes CMYK JPEG input into safe public variants", async () => {
    const processor = createSharpImageProcessor();
    const source = await sharp({
      create: {
        background: {
          b: 32,
          g: 160,
          r: 240
        },
        channels: 3,
        height: 64,
        width: 96
      }
    }).toColorspace("cmyk").jpeg().toBuffer();

    const processed = await processor.process({
      assetId,
      declaredMimeType: "image/jpeg",
      siteId,
      slot: "preview",
      source
    });

    expect(processed.originalFormat).toBe("jpeg");
    expect(processed.variants.map((variant) => variant.format).sort()).toEqual([
      "avif",
      "webp"
    ]);
    for (const variant of processed.variants) {
      const metadata = await sharp(variant.body).metadata();

      expect(metadata.space).not.toBe("cmyk");
      expect(metadata.width).toBe(96);
    }
  });

  it("rejects unsupported, mismatched, corrupt, animated, and over-limit input safely", async () => {
    const processor = createSharpImageProcessor();
    const png = await fixture("png");

    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/svg+xml",
        siteId,
        slot: "preview",
        source: Buffer.from("<svg />")
      })
    ).rejects.toMatchObject({ code: "IMAGE_FORMAT_UNSUPPORTED" });
    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/jpeg",
        siteId,
        slot: "preview",
        source: png
      })
    ).rejects.toMatchObject({ code: "IMAGE_MIME_MISMATCH" });
    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: Buffer.from("not an image")
      })
    ).rejects.toMatchObject({ code: "IMAGE_INVALID" });

    const animatedWebp = await sharp([
      await fixture("png", { width: 4, height: 4 }),
      await fixture("png", { width: 4, height: 4 })
    ] as never)
      .webp()
      .toBuffer()
      .catch(() => undefined);

    const animatedMetadata =
      animatedWebp === undefined
        ? undefined
        : await sharp(animatedWebp, { animated: true })
            .metadata()
            .catch(() => undefined);

    if (animatedWebp !== undefined && (animatedMetadata?.pages ?? 1) > 1) {
      await expect(
        processor.process({
          assetId,
          declaredMimeType: "image/webp",
          siteId,
          slot: "preview",
          source: animatedWebp
        })
      ).rejects.toMatchObject({ code: "IMAGE_ANIMATION_NOT_ALLOWED" });
    }

    const tinyLimitProcessor = createSharpImageProcessor({ maxPixels: 10 });

    await expect(
      tinyLimitProcessor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: png
      })
    ).rejects.toMatchObject({ code: "IMAGE_PIXEL_LIMIT_EXCEEDED" });
  });

  it("rejects oversized pixel counts after metadata preflight before variant encoding", async () => {
    const toBuffer = vi.fn(async () => Buffer.from("should-not-encode"));
    const metadataPipeline = {
      metadata: vi.fn(async () => ({
        format: "png",
        height: 100,
        orientation: 6,
        pages: 1,
        width: 100
      })),
      destroy: vi.fn()
    };
    const encodingPipeline = {
      avif: vi.fn(() => encodingPipeline),
      clone: vi.fn(() => encodingPipeline),
      destroy: vi.fn(),
      resize: vi.fn(() => encodingPipeline),
      rotate: vi.fn(() => encodingPipeline),
      toBuffer,
      toColorspace: vi.fn(() => encodingPipeline),
      webp: vi.fn(() => encodingPipeline)
    };
    let callCount = 0;
    const sharpFactory = vi.fn((_input?: unknown, _options?: unknown) => {
      callCount += 1;

      return callCount === 1 ? metadataPipeline : encodingPipeline;
    });
    const processor = createSharpImageProcessor({
      maxPixels: 9_999,
      sharpFactory
    } as never);

    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: Buffer.from("fake-png")
      })
    ).rejects.toMatchObject({ code: "IMAGE_PIXEL_LIMIT_EXCEEDED" });

    expect(sharpFactory).toHaveBeenCalledTimes(1);
    expect(sharpFactory.mock.calls[0]?.[1]).toMatchObject({
      failOn: "error",
      limitInputPixels: 9_999
    });
    expect(toBuffer).not.toHaveBeenCalled();
  });

  it("terminates an active Sharp pipeline when the configured processing timeout elapses", async () => {
    vi.useFakeTimers();

    try {
      let rejectToBuffer: ((error: Error) => void) | undefined;
      const metadataPipeline = {
        metadata: vi.fn(async () => ({
          format: "png",
          height: 600,
          pages: 1,
          width: 1200
        })),
        destroy: vi.fn()
      };
      const variantPipeline = {
        avif: vi.fn(() => variantPipeline),
        destroy: vi.fn((error?: Error) => {
          rejectToBuffer?.(error ?? new Error("destroyed"));
          return variantPipeline;
        }),
        resize: vi.fn(() => variantPipeline),
        toBuffer: vi.fn(
          () =>
            new Promise<Buffer>((_resolve, reject) => {
              rejectToBuffer = reject;
            })
        ),
        webp: vi.fn(() => variantPipeline)
      };
      const basePipeline = {
        clone: vi.fn(() => variantPipeline),
        destroy: vi.fn(),
        rotate: vi.fn(() => basePipeline),
        toColorspace: vi.fn(() => basePipeline)
      };
      let callCount = 0;
      const sharpFactory = vi.fn((_input?: unknown, _options?: unknown) => {
        callCount += 1;

        return callCount === 1 ? metadataPipeline : basePipeline;
      });
      const processor = createSharpImageProcessor({
        sharpFactory,
        timeoutMs: 60_000
      } as never);
      const result = processor
        .process({
          assetId,
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("fake-png")
        })
        .catch((error: unknown) => error);

      await Promise.resolve();
      await Promise.resolve();
      for (let index = 0; index < 10 && variantPipeline.toBuffer.mock.calls.length === 0; index += 1) {
        await Promise.resolve();
      }
      expect(variantPipeline.toBuffer).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(result).resolves.toMatchObject({
        code: "IMAGE_PROCESSING_TIMEOUT"
      });
      expect(variantPipeline.destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("terminates an active AVIF Sharp pipeline when the configured processing timeout elapses", async () => {
    vi.useFakeTimers();

    try {
      let rejectAvif: ((error: Error) => void) | undefined;
      const metadataPipeline = {
        metadata: vi.fn(async () => ({
          format: "png",
          height: 600,
          pages: 1,
          width: 1200
        })),
        destroy: vi.fn()
      };
      const outputPipeline = {
        destroy: vi.fn(),
        metadata: vi.fn(async () => ({
          height: 240,
          mediaType: "image/webp",
          width: 480
        })),
        timeout: vi.fn(() => outputPipeline)
      };
      const webpPipeline = {
        avif: vi.fn(() => webpPipeline),
        destroy: vi.fn(),
        resize: vi.fn(() => webpPipeline),
        toBuffer: vi.fn(async () => Buffer.from("webp")),
        webp: vi.fn(() => webpPipeline)
      };
      const avifPipeline = {
        avif: vi.fn(() => avifPipeline),
        destroy: vi.fn((error?: Error) => {
          rejectAvif?.(error ?? new Error("destroyed"));
          return avifPipeline;
        }),
        resize: vi.fn(() => avifPipeline),
        toBuffer: vi.fn(
          () =>
            new Promise<Buffer>((_resolve, reject) => {
              rejectAvif = reject;
            })
        ),
        webp: vi.fn(() => avifPipeline)
      };
      const basePipeline = {
        clone: vi.fn()
          .mockReturnValueOnce(webpPipeline)
          .mockReturnValueOnce(avifPipeline),
        destroy: vi.fn(),
        rotate: vi.fn(() => basePipeline),
        toColorspace: vi.fn(() => basePipeline)
      };
      let callCount = 0;
      const sharpFactory = vi.fn(() => {
        callCount += 1;

        if (callCount === 1) {
          return metadataPipeline;
        }
        if (callCount === 2) {
          return basePipeline;
        }

        return outputPipeline;
      });
      const processor = createSharpImageProcessor({
        sharpFactory,
        timeoutMs: 60_000
      } as never);
      const result = processor
        .process({
          assetId,
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("fake-png")
        })
        .catch((error: unknown) => error);

      for (let index = 0; index < 10 && avifPipeline.toBuffer.mock.calls.length === 0; index += 1) {
        await Promise.resolve();
      }
      expect(webpPipeline.toBuffer).toHaveBeenCalledTimes(1);
      expect(avifPipeline.toBuffer).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(result).resolves.toMatchObject({
        code: "IMAGE_PROCESSING_TIMEOUT"
      });
      expect(avifPipeline.destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies native Sharp timeouts to metadata, encode, and output verification pipelines", async () => {
    const metadataPipeline = {
      destroy: vi.fn(),
      metadata: vi.fn(async () => ({
        format: "png",
        height: 600,
        pages: 1,
        width: 1200
      })),
      timeout: vi.fn(() => metadataPipeline)
    };
    let outputMetadataCalls = 0;
    const outputPipeline = {
      destroy: vi.fn(),
      metadata: vi.fn(async () => {
        outputMetadataCalls += 1;

        return {
          height: 240,
          mediaType: outputMetadataCalls % 2 === 0 ? "image/avif" : "image/webp",
          width: 480
        };
      }),
      timeout: vi.fn(() => outputPipeline)
    };
    const variantPipeline = {
      avif: vi.fn(() => variantPipeline),
      destroy: vi.fn(),
      resize: vi.fn(() => variantPipeline),
      timeout: vi.fn(() => variantPipeline),
      toBuffer: vi.fn(async () => Buffer.from("encoded")),
      webp: vi.fn(() => variantPipeline)
    };
    const basePipeline = {
      clone: vi.fn(() => variantPipeline),
      destroy: vi.fn(),
      rotate: vi.fn(() => basePipeline),
      timeout: vi.fn(() => basePipeline),
      toColorspace: vi.fn(() => basePipeline)
    };
    let callCount = 0;
    const sharpFactory = vi.fn(() => {
      callCount += 1;

      if (callCount === 1) {
        return metadataPipeline;
      }
      if (callCount === 2) {
        return basePipeline;
      }

      return outputPipeline;
    });
    const processor = createSharpImageProcessor({
      maxPixels: 2_000_000,
      sharpFactory,
      timeoutMs: 90_000
    } as never);

    await processor.process({
      assetId,
      declaredMimeType: "image/png",
      siteId,
      slot: "preview",
      source: Buffer.from("fake-png")
    });

    expect(metadataPipeline.timeout).toHaveBeenCalledWith({ seconds: expect.any(Number) });
    expect(variantPipeline.timeout).toHaveBeenCalledWith({ seconds: expect.any(Number) });
    expect(outputPipeline.timeout).toHaveBeenCalledWith({ seconds: expect.any(Number) });
  });

  it("starts the processing timeout after the processor semaphore is acquired", async () => {
    const source = await fixture("png");
    vi.useFakeTimers();

    try {
      let releaseQueue!: () => void;
      const queued = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      const semaphore = {
        async run<T>(operation: () => Promise<T>): Promise<T> {
          await queued;

          return operation();
        }
      };
      const processor = createSharpImageProcessor({ semaphore, timeoutMs: 1 });
      let settled = false;
      const result = processor
        .process({
          assetId,
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source
        })
        .then(
          (value) => {
            settled = true;
            return { status: "fulfilled" as const, value };
          },
          (error: unknown) => {
            settled = true;
            return { error, status: "rejected" as const };
          }
        );

      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toBe(false);

      releaseQueue();
      const outcome = await result;

      expect(outcome.status).toBe("fulfilled");
      if (outcome.status === "fulfilled") {
        expect(outcome.value.variants).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out a genuinely hung source pipeline with a safe error after native destroy settles", async () => {
    let rejectNative!: (error: Error) => void;
    const hungPipeline = {
      destroy: vi.fn((error?: Error) => {
        rejectNative(error ?? new Error("destroyed"));
      }),
      metadata: () =>
        new Promise((_resolve, reject) => {
          rejectNative = reject;
        }),
      timeout: vi.fn(() => hungPipeline)
    };
    const semaphore = {
      async run<T>(operation: () => Promise<T>): Promise<T> {
        return operation();
      }
    };
    const processor = createSharpImageProcessor({
      semaphore,
      sharpFactory: (() => hungPipeline) as never,
      timeoutMs: 1
    } as never);

    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: Buffer.from("fake-png")
      })
    ).rejects.toMatchObject({ code: "IMAGE_PROCESSING_TIMEOUT" });
  });

  it("maps native Sharp timeout errors to the safe processing timeout taxonomy", async () => {
    const semaphore = {
      async run<T>(operation: () => Promise<T>): Promise<T> {
        return operation();
      }
    };
    const metadataPipeline = {
      destroy: vi.fn(),
      metadata: vi.fn(async () => {
        throw new Error("Operation timed out");
      }),
      timeout: vi.fn(() => metadataPipeline)
    };
    const processor = createSharpImageProcessor({
      semaphore,
      sharpFactory: (() => metadataPipeline) as never,
      timeoutMs: 90_000
    } as never);

    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: Buffer.from("fake-png")
      })
    ).rejects.toMatchObject({ code: "IMAGE_PROCESSING_TIMEOUT" });
  });

  it("keeps the processor slot busy until timed-out native work settles after destroy", async () => {
    vi.useFakeTimers();

    try {
      const semaphore = createImagePipelineSemaphore({
        maxActive: 1,
        maxQueued: 1,
        queueWaitTimeoutMs: 5_000
      });
      const events: string[] = [];
      let rejectNative!: (error: Error) => void;
      const firstPipeline = {
        destroy: vi.fn(() => {
          events.push("first:destroy");
        }),
        metadata: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              rejectNative = reject;
            })
        ),
        timeout: vi.fn(() => firstPipeline)
      };
      const secondPipeline = {
        destroy: vi.fn(),
        metadata: vi.fn(async () => {
          events.push("second:metadata");
          throw new Error("second operation started");
        }),
        timeout: vi.fn(() => secondPipeline)
      };
      const sharpFactory = vi
        .fn()
        .mockImplementationOnce(() => firstPipeline)
        .mockImplementation(() => secondPipeline);
      const processor = createSharpImageProcessor({
        drainFailureGraceMs: 5_000,
        semaphore,
        sharpFactory,
        timeoutMs: 5
      } as never);
      let firstSettled = false;
      const first = processor
        .process({
          assetId,
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("first")
        })
        .catch((error: unknown) => {
          firstSettled = true;
          events.push(`first:${error instanceof AppError ? error.code : "unknown"}`);
          return error;
        });

      await vi.advanceTimersByTimeAsync(5);
      await Promise.resolve();

      expect(firstPipeline.destroy).toHaveBeenCalledTimes(1);
      expect(firstSettled).toBe(false);
      expect(semaphore.stats?.()).toEqual({ active: 1, queued: 0 });

      const second = processor
        .process({
          assetId: "33333333-3333-4333-8333-333333333334",
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("second")
        })
        .catch((error: unknown) => error);

      await Promise.resolve();

      expect(events).not.toContain("second:metadata");
      expect(semaphore.stats?.()).toEqual({ active: 1, queued: 1 });

      rejectNative(new Error("Operation timed out"));

      await expect(first).resolves.toMatchObject({
        code: "IMAGE_PROCESSING_TIMEOUT"
      });
      await expect(second).resolves.toMatchObject({
        code: "IMAGE_INVALID"
      });
      expect(events[0]).toBe("first:destroy");
      expect(events).toEqual(
        expect.arrayContaining([
          "first:IMAGE_PROCESSING_TIMEOUT",
          "second:metadata"
        ])
      );
      expect(semaphore.stats?.()).toEqual({ active: 0, queued: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the processor slot busy until aborted native work settles after destroy", async () => {
    const controller = new AbortController();
    const semaphore = createImagePipelineSemaphore({
      maxActive: 1,
      maxQueued: 1,
      queueWaitTimeoutMs: 5_000
    });
    const events: string[] = [];
    let rejectNative!: (error: Error) => void;
    const firstPipeline = {
      destroy: vi.fn(() => {
        events.push("first:destroy");
      }),
      metadata: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectNative = reject;
          })
      ),
      timeout: vi.fn(() => firstPipeline)
    };
    const secondPipeline = {
      destroy: vi.fn(),
      metadata: vi.fn(async () => {
        events.push("second:metadata");
        throw new Error("second operation started");
      }),
      timeout: vi.fn(() => secondPipeline)
    };
    const sharpFactory = vi
      .fn()
      .mockImplementationOnce(() => firstPipeline)
      .mockImplementation(() => secondPipeline);
    const processor = createSharpImageProcessor({
      drainFailureGraceMs: 5_000,
      semaphore,
      sharpFactory,
      timeoutMs: 90_000
    } as never);
    let firstSettled = false;
    const first = processor
      .process({
        assetId,
        declaredMimeType: "image/png",
        signal: controller.signal,
        siteId,
        slot: "preview",
        source: Buffer.from("first")
      })
      .catch((error: unknown) => {
        firstSettled = true;
        events.push(`first:${error instanceof AppError ? error.code : "unknown"}`);
        return error;
      });

    await Promise.resolve();
    controller.abort();
    await Promise.resolve();

    expect(firstPipeline.destroy).toHaveBeenCalledTimes(1);
    expect(firstSettled).toBe(false);

    const second = processor
      .process({
        assetId: "33333333-3333-4333-8333-333333333334",
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: Buffer.from("second")
      })
      .catch((error: unknown) => error);

    await Promise.resolve();

    expect(events).not.toContain("second:metadata");
    expect(semaphore.stats?.()).toEqual({ active: 1, queued: 1 });

    rejectNative(new Error("AbortError"));

    await expect(first).resolves.toMatchObject({ code: "CLIENT_ABORTED" });
    await expect(second).resolves.toMatchObject({ code: "IMAGE_INVALID" });
    expect(semaphore.stats?.()).toEqual({ active: 0, queued: 0 });
  });

  it("poisons the processor and rejects new work when destroyed native work never drains", async () => {
    vi.useFakeTimers();

    try {
      const hungPipeline = {
        destroy: vi.fn(),
        metadata: vi.fn(() => new Promise(() => undefined)),
        timeout: vi.fn(() => hungPipeline)
      };
      const sharpFactory = vi.fn(() => hungPipeline);
      const processor = createSharpImageProcessor({
        drainFailureGraceMs: 10,
        sharpFactory,
        timeoutMs: 5
      } as never);
      const first = processor
        .process({
          assetId,
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("hung")
        })
        .catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(15);
      await vi.advanceTimersByTimeAsync(10);

      await expect(first).resolves.toMatchObject({
        code: "IMAGE_PROCESSOR_BUSY",
        statusCode: 503
      });
      await expect(
        processor.process({
          assetId: "33333333-3333-4333-8333-333333333334",
          declaredMimeType: "image/png",
          siteId,
          slot: "preview",
          source: Buffer.from("new")
        })
      ).rejects.toMatchObject({
        code: "IMAGE_PROCESSOR_BUSY",
        statusCode: 503
      });
      expect(sharpFactory).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps semaphore compatibility for rejected operations", async () => {
    const semaphore = {
      async run<T>(_operation: () => Promise<T>): Promise<T> {
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "unreachable",
          statusCode: 500
        });
      }
    };
    const processor = createSharpImageProcessor({ semaphore, timeoutMs: 1 });

    await expect(
      processor.process({
        assetId,
        declaredMimeType: "image/png",
        siteId,
        slot: "preview",
        source: await fixture("png")
      })
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("createImagePipelineSemaphore", () => {
  it("limits active image pipelines and releases slots after rejection", async () => {
    const semaphore = createImagePipelineSemaphore(1);
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstWait = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = semaphore.run(async () => {
      events.push("first:start");
      await firstWait;
      events.push("first:end");
      return "first";
    });
    const second = semaphore.run(async () => {
      events.push("second:start");
      throw new Error("second failed");
    });
    const third = semaphore.run(async () => {
      events.push("third:start");
      return "third";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();

    await expect(first).resolves.toBe("first");
    await expect(second).rejects.toThrow("second failed");
    await expect(third).resolves.toBe("third");
    expect(events).toEqual(["first:start", "first:end", "second:start", "third:start"]);
  });

  it("rejects admission when the bounded queue is full without starting work", async () => {
    const semaphore = createImagePipelineSemaphore({
      maxActive: 1,
      maxQueued: 1,
      queueWaitTimeoutMs: 5_000
    });
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstWait = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = semaphore.run(async () => {
      events.push("first:start");
      await firstWait;
      return "first";
    });
    const second = semaphore.run(async () => {
      events.push("second:start");
      return "second";
    });

    await expect(
      semaphore.run(async () => {
        events.push("third:start");
        return "third";
      })
    ).rejects.toMatchObject({
      code: "IMAGE_PROCESSOR_BUSY",
      statusCode: 503
    });

    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "second:start"]);
  });

  it("removes aborted queued work and never retains its operation", async () => {
    const semaphore = createImagePipelineSemaphore({
      maxActive: 1,
      maxQueued: 2,
      queueWaitTimeoutMs: 5_000
    });
    const controller = new AbortController();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstWait = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = semaphore.run(async () => {
      events.push("first:start");
      await firstWait;
    });
    const aborted = semaphore.run(async () => {
      events.push("aborted:start");
    }, { signal: controller.signal }).catch((error: unknown) => error);
    const next = semaphore.run(async () => {
      events.push("next:start");
      return "next";
    });

    controller.abort();
    await expect(aborted).resolves.toMatchObject({
      code: "CLIENT_ABORTED"
    });
    releaseFirst();
    await first;
    await expect(next).resolves.toBe("next");
    expect(events).toEqual(["first:start", "next:start"]);
    expect(semaphore.stats?.()).toEqual({
      active: 0,
      queued: 0
    });
  });
});
