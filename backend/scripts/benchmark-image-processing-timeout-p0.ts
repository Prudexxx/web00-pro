import { performance } from "node:perf_hooks";
import process from "node:process";
import sharp from "sharp";
import { createSharpImageProcessor } from "../src/modules/images/image-processor.js";

type BenchmarkFormat = "avif" | "jpeg" | "png" | "webp";

type BenchmarkFixture = {
  assetId: string;
  channels: 3 | 4;
  format: BenchmarkFormat;
  height: number;
  label: string;
  seed: number;
  width: number;
};

type CacheCandidate = {
  cache: Parameters<typeof sharp.cache>[0];
  label: string;
};

const timeoutMs = 90_000;
const constrainedConcurrency = 1;
const maxPixels = 16_000_000;
const repetitions = readPositiveInteger(process.env.IMAGE_BENCH_REPETITIONS, 30);
const siteId = "11111111-1111-4111-8111-111111111111";
const fixtures: BenchmarkFixture[] = [
  {
    assetId: "00000000-0000-4000-8000-000000000701",
    channels: 3,
    format: "png",
    height: 562,
    label: "production-shaped-903x562-png",
    seed: 17,
    width: 903
  },
  {
    assetId: "00000000-0000-4000-8000-000000000702",
    channels: 3,
    format: "png",
    height: 1080,
    label: "production-like-screenshot-1-png",
    seed: 29,
    width: 1920
  },
  {
    assetId: "00000000-0000-4000-8000-000000000703",
    channels: 4,
    format: "webp",
    height: 900,
    label: "alpha-webp-1200x900",
    seed: 41,
    width: 1200
  },
  {
    assetId: "00000000-0000-4000-8000-000000000704",
    channels: 3,
    format: "jpeg",
    height: 900,
    label: "jpeg-1200x900",
    seed: 53,
    width: 1200
  },
  {
    assetId: "00000000-0000-4000-8000-000000000705",
    channels: 3,
    format: "avif",
    height: 900,
    label: "avif-1200x900",
    seed: 67,
    width: 1200
  }
];
const cacheCandidates: CacheCandidate[] = [
  { cache: false, label: "disabled" },
  { cache: { files: 0, items: 128, memory: 16 }, label: "memory-16mb" },
  { cache: { files: 0, items: 128, memory: 32 }, label: "memory-32mb" },
  { cache: true, label: "sharp-current-default" }
];

async function main(): Promise<void> {
  sharp.concurrency(constrainedConcurrency);
  const preparedFixtures = await Promise.all(
    fixtures.map(async (fixture) => ({
      ...fixture,
      estimatedDecodedBytes: estimateDecodedBytes(fixture),
      source: await createPatternImage(fixture)
    }))
  );
  const benchmarkStartedAt = new Date().toISOString();
  const candidates = [];

  for (const candidate of cacheCandidates) {
    sharp.cache(candidate.cache);
    sharp.concurrency(constrainedConcurrency);
    const processor = createSharpImageProcessor({
      maxConcurrency: constrainedConcurrency,
      maxPixels,
      timeoutMs
    });

    sharp.cache(candidate.cache);
    const monitor = createMemoryMonitor();
    const results = [];

    monitor.start();
    for (const fixture of preparedFixtures) {
      const durations: number[] = [];
      let timeoutCount = 0;

      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const startedAt = performance.now();

        try {
          const processed = await processor.process({
            assetId: fixture.assetId,
            declaredMimeType: `image/${fixture.format === "jpeg" ? "jpeg" : fixture.format}`,
            siteId,
            slot: "gallery",
            source: fixture.source
          });

          durations.push(performance.now() - startedAt);
          if (processed.variants.length === 0) {
            throw new Error("benchmark generated no variants");
          }
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "IMAGE_PROCESSING_TIMEOUT"
          ) {
            timeoutCount += 1;
            continue;
          }

          throw error;
        }
      }

      results.push({
        decodedMemory: {
          channels: fixture.channels,
          estimatedDecodedBytes: fixture.estimatedDecodedBytes
        },
        durationMs: summarizeDurations(durations),
        format: fixture.format,
        inputBytes: fixture.source.length,
        label: fixture.label,
        originalHeight: fixture.height,
        originalPixels: fixture.width * fixture.height,
        originalWidth: fixture.width,
        repetitions,
        timeoutCount
      });
    }
    monitor.stop();

    candidates.push({
      cacheAfter: sharp.cache(),
      cacheCandidate: candidate.label,
      countersAfter: sharp.counters(),
      memory: monitor.snapshot(),
      results
    });
  }

  console.log(
    JSON.stringify(
      {
        benchmarkStartedAt,
        constrainedConcurrency,
        maxPixels,
        note:
          "Local benchmark only; this machine is not a Render Free 0.1 CPU replica.",
        repetitions,
        timeoutMs,
        candidates
      },
      null,
      2
    )
  );
}

function createMemoryMonitor(): {
  snapshot: () => {
    arrayBuffers: number;
    external: number;
    heapUsed: number;
    peakRss: number;
    rss: number;
  };
  start: () => void;
  stop: () => void;
} {
  let current = process.memoryUsage();
  let peakRss = current.rss;
  let timer: NodeJS.Timeout | undefined;

  return {
    snapshot() {
      current = process.memoryUsage();
      peakRss = Math.max(peakRss, current.rss);

      return {
        arrayBuffers: current.arrayBuffers,
        external: current.external,
        heapUsed: current.heapUsed,
        peakRss,
        rss: current.rss
      };
    },
    start() {
      timer = setInterval(() => {
        current = process.memoryUsage();
        peakRss = Math.max(peakRss, current.rss);
      }, 50);
    },
    stop() {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    }
  };
}

function summarizeDurations(values: readonly number[]): {
  max: number | null;
  median: number | null;
  min: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
} {
  if (values.length === 0) {
    return {
      max: null,
      median: null,
      min: null,
      p90: null,
      p95: null,
      p99: null
    };
  }

  const sorted = [...values].sort((left, right) => left - right);

  return {
    max: Math.round(sorted[sorted.length - 1] as number),
    median: Math.round(percentile(sorted, 0.5)),
    min: Math.round(sorted[0] as number),
    p90: Math.round(percentile(sorted, 0.9)),
    p95: Math.round(percentile(sorted, 0.95)),
    p99: sorted.length >= 100 ? Math.round(percentile(sorted, 0.99)) : null
  };
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );

  return sorted[index] as number;
}

function estimateDecodedBytes(input: BenchmarkFixture): number {
  const bytesPerChannel = 1;

  return input.width * input.height * input.channels * bytesPerChannel;
}

async function createPatternImage(input: BenchmarkFixture): Promise<Buffer> {
  const raw = Buffer.allocUnsafe(input.width * input.height * input.channels);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * input.channels;
      const grid = ((Math.floor(x / 24) + Math.floor(y / 24) + input.seed) % 2) * 38;

      raw[offset] = (x + input.seed * 13 + grid) % 256;
      raw[offset + 1] = (y + input.seed * 7 + grid) % 256;
      raw[offset + 2] = (x + y + input.seed * 3 + grid) % 256;
      if (input.channels === 4) {
        raw[offset + 3] = 192;
      }
    }
  }

  const pipeline = sharp(raw, {
    raw: {
      channels: input.channels,
      height: input.height,
      width: input.width
    }
  });

  if (input.format === "jpeg") {
    return pipeline.jpeg().toBuffer();
  }
  if (input.format === "webp") {
    return pipeline.webp().toBuffer();
  }
  if (input.format === "avif") {
    return pipeline.avif().toBuffer();
  }

  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

await main();
