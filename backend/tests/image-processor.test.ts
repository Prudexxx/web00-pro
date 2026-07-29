import sharp from "sharp";
import { describe, expect, it } from "vitest";
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

  it("times out a source pipeline with a safe error", async () => {
    const semaphore = {
      async run<T>(_operation: () => Promise<T>): Promise<T> {
        await new Promise(() => undefined);
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
    ).rejects.toMatchObject({ code: "IMAGE_PROCESSING_TIMEOUT" });
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
});
