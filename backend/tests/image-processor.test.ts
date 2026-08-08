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
  it("uses the weak CPU image processing timeout and bounded Sharp cache by default", () => {
    const processor = createSharpImageProcessor();

    expect(processor.timeoutMs).toBe(90_000);
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
});
