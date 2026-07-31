import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { createSharpImageProcessor } from "../src/modules/images/image-processor.js";

type BenchmarkFixture = {
  assetId: string;
  height: number;
  label: string;
  seed: number;
  width: number;
};

const timeoutMs = 150_000;
const constrainedConcurrency = 1;
const fixtures: BenchmarkFixture[] = [
  {
    assetId: "00000000-0000-4000-8000-000000000701",
    height: 1080,
    label: "production-like-screenshot-1",
    seed: 17,
    width: 1920
  },
  {
    assetId: "00000000-0000-4000-8000-000000000702",
    height: 1200,
    label: "production-like-screenshot-5",
    seed: 29,
    width: 1920
  }
];

async function main(): Promise<void> {
  const processor = createSharpImageProcessor({
    maxConcurrency: constrainedConcurrency,
    timeoutMs
  });
  const preparedFixtures = await Promise.all(
    fixtures.map(async (fixture) => ({
      ...fixture,
      source: await createPatternPng(fixture)
    }))
  );
  let active = 0;
  let peakConcurrency = 0;
  const results = [];

  for (const fixture of preparedFixtures) {
    active += 1;
    peakConcurrency = Math.max(peakConcurrency, active);

    const startedAt = performance.now();
    const processed = await processor.process({
      assetId: fixture.assetId,
      declaredMimeType: "image/png",
      siteId: "11111111-1111-4111-8111-111111111111",
      slot: "gallery",
      source: fixture.source
    });
    const durationMs = Math.round(performance.now() - startedAt);

    active -= 1;
    results.push({
      durationMs,
      generatedVariants: processed.variants.length,
      inputBytes: fixture.source.length,
      label: fixture.label,
      originalHeight: processed.originalHeight,
      originalPixels: processed.originalPixels,
      originalWidth: processed.originalWidth,
      variantWidths: processed.widths
    });
  }

  console.log(
    JSON.stringify(
      {
        constrainedConcurrency,
        note:
          "Local benchmark only; this machine is not a Render Free 0.1 CPU replica.",
        peakConcurrency,
        results,
        timeoutMs
      },
      null,
      2
    )
  );
}

async function createPatternPng(input: BenchmarkFixture): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.allocUnsafe(input.width * input.height * channels);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * channels;
      const grid = ((Math.floor(x / 24) + Math.floor(y / 24) + input.seed) % 2) * 38;

      raw[offset] = (x + input.seed * 13 + grid) % 256;
      raw[offset + 1] = (y + input.seed * 7 + grid) % 256;
      raw[offset + 2] = (x + y + input.seed * 3 + grid) % 256;
    }
  }

  return sharp(raw, {
    raw: {
      channels,
      height: input.height,
      width: input.width
    }
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

await main();
