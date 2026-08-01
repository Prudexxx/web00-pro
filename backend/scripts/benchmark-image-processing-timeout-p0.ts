import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  decideBenchmarkAcceptance,
  isStrictlyMonotonicGrowth,
  summarizeMemorySamples,
  type BenchmarkAcceptanceDecision,
  type BenchmarkRepetitionMemorySample,
  type SharpCacheSnapshot,
  type SharpCountersSnapshot
} from "./benchmark-image-processing-acceptance.js";
import { createSharpImageProcessor } from "../src/modules/images/image-processor.js";

type BenchmarkFormat = "jpeg" | "png" | "webp";

type BenchmarkFixture = {
  assetId: string;
  bytesPerChannel: 1 | 2;
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

type BenchmarkConfig = {
  maxRuntimeMs: number | null;
  outputPath: string | null;
  repetitions: number;
  selectedCaches: CacheCandidate[];
  selectedFixtures: BenchmarkFixture[];
};

type BenchmarkReport = {
  benchmarkStartedAt: string;
  cacheSelector: string[];
  candidates: CandidateResult[];
  completedRepetitions: number;
  constrainedConcurrency: number;
  durationMs: number | null;
  failureReasons: string[];
  finishedAt: string | null;
  fixtureSelector: string[];
  gcAvailable: boolean;
  maxPixels: number;
  maxRuntimeMs: number | null;
  note: string;
  requestedRepetitions: number;
  repetitions: number;
  runtimeFailureReasons: string[];
  selectedCache: string;
  selectedFixture: string;
  startedAt: string;
  status: "FAIL" | "PASS" | "STOPPED";
  stopped: boolean;
  timeoutMs: number;
};

type CandidateResult = {
  cacheAfter: SharpCacheSnapshot;
  cacheBefore: SharpCacheSnapshot;
  cacheCandidate: string;
  countersAfter: SharpCountersSnapshot;
  countersBefore: SharpCountersSnapshot;
  durationMs: number | null;
  failureReasons: string[];
  finishedAt: string | null;
  memory: {
    arrayBuffers: number;
    external: number;
    heapUsed: number;
    peakRss: number;
    rss: number;
  };
  results: FixtureResult[];
  startedAt: string;
  status: "FAIL" | "PASS" | "STOPPED";
};

type FixtureResult = {
  acceptance: BenchmarkAcceptanceDecision;
  decodedMemory: {
    bytesPerChannel: 1 | 2;
    channels: 3 | 4;
    estimatedDecodedBytes: number;
  };
  durationMs: ReturnType<typeof summarizeDurations>;
  errorCount: number;
  failures: Array<{
    code: string;
    repetition: number;
  }>;
  format: BenchmarkFormat;
  inputBytes: number;
  label: string;
  memoryAfter: NodeJS.MemoryUsage;
  memorySamples: Array<{
    arrayBuffers: number;
    external: number;
    heapUsed: number;
    repetition: number;
    rss: number;
  }>;
  originalHeight: number;
  originalPixels: number;
  originalWidth: number;
  peakRssBytes: number;
  repetitionsAttempted: number;
  repetitionsRequested: number;
  rssDeltaBytes: number;
  rssMonotonicIncreaseCount: number;
  rssStrictlyMonotonicGrowth: boolean;
  samples: BenchmarkRepetitionMemorySample[];
  sharpCounterLeaks: number;
  stopped: boolean;
  summary: ReturnType<typeof summarizeMemorySamples>;
  timeoutCount: number;
};

type PreparedFixture = BenchmarkFixture & {
  estimatedDecodedBytes: number;
  source: Buffer;
};

const timeoutMs = 90_000;
const constrainedConcurrency = 1;
const maxPixels = 16_000_000;
const siteId = "11111111-1111-4111-8111-111111111111";
const fixtures: BenchmarkFixture[] = [
  {
    assetId: "00000000-0000-4000-8000-000000000701",
    bytesPerChannel: 1,
    channels: 3,
    format: "png",
    height: 562,
    label: "production-shaped-903x562-png",
    seed: 17,
    width: 903
  },
  {
    assetId: "00000000-0000-4000-8000-000000000702",
    bytesPerChannel: 1,
    channels: 3,
    format: "png",
    height: 1080,
    label: "production-like-1920x1080-png",
    seed: 29,
    width: 1920
  },
  {
    assetId: "00000000-0000-4000-8000-000000000703",
    bytesPerChannel: 1,
    channels: 4,
    format: "webp",
    height: 900,
    label: "alpha-webp",
    seed: 41,
    width: 1200
  },
  {
    assetId: "00000000-0000-4000-8000-000000000704",
    bytesPerChannel: 1,
    channels: 3,
    format: "jpeg",
    height: 900,
    label: "jpeg",
    seed: 53,
    width: 1200
  },
  {
    assetId: "00000000-0000-4000-8000-000000000705",
    bytesPerChannel: 1,
    channels: 3,
    format: "png",
    height: 4000,
    label: "near-supported-16mp-png",
    seed: 67,
    width: 4000
  },
  {
    assetId: "00000000-0000-4000-8000-000000000706",
    bytesPerChannel: 2,
    channels: 3,
    format: "png",
    height: 1024,
    label: "rgb16-decoded-estimate",
    seed: 71,
    width: 1024
  },
  {
    assetId: "00000000-0000-4000-8000-000000000707",
    bytesPerChannel: 2,
    channels: 4,
    format: "png",
    height: 1024,
    label: "rgba16-decoded-estimate",
    seed: 73,
    width: 1024
  }
];
const cacheCandidates: CacheCandidate[] = [
  { cache: false, label: "disabled" },
  { cache: { files: 0, items: 128, memory: 16 }, label: "memory-16mb" },
  { cache: { files: 0, items: 128, memory: 32 }, label: "memory-32mb" }
];

async function main(): Promise<void> {
  const config = readBenchmarkConfig();
  sharp.concurrency(constrainedConcurrency);
  const startedAtMs = performance.now();
  const report: BenchmarkReport = {
    benchmarkStartedAt: new Date().toISOString(),
    cacheSelector: config.selectedCaches.map((candidate) => candidate.label),
    candidates: [],
    completedRepetitions: 0,
    constrainedConcurrency,
    durationMs: null,
    failureReasons: [],
    finishedAt: null,
    fixtureSelector: config.selectedFixtures.map((fixture) => fixture.label),
    gcAvailable: typeof (globalThis as { gc?: unknown }).gc === "function",
    maxPixels,
    maxRuntimeMs: config.maxRuntimeMs,
    note:
      "Constrained local evidence only; this machine is not a Render Free 0.1 CPU replica.",
    requestedRepetitions:
      config.repetitions * config.selectedCaches.length * config.selectedFixtures.length,
    repetitions: config.repetitions,
    runtimeFailureReasons: [],
    selectedCache: config.selectedCaches.map((candidate) => candidate.label).join(","),
    selectedFixture: config.selectedFixtures.map((fixture) => fixture.label).join(","),
    startedAt: new Date().toISOString(),
    status: "PASS",
    stopped: false,
    timeoutMs
  };

  try {
    for (const candidate of config.selectedCaches) {
      if (runtimeExceeded(startedAtMs, config.maxRuntimeMs)) {
        report.stopped = true;
        break;
      }

      sharp.cache(candidate.cache);
      sharp.concurrency(constrainedConcurrency);
      const processor = createSharpImageProcessor({
        maxConcurrency: constrainedConcurrency,
        maxPixels,
        maxQueued: 0,
        timeoutMs
      });
      sharp.cache(candidate.cache);
      sharp.concurrency(constrainedConcurrency);
      const monitor = createMemoryMonitor();
      const candidateResult: CandidateResult = {
        cacheAfter: snapshotSharpCache(),
        cacheBefore: snapshotSharpCache(),
        cacheCandidate: candidate.label,
        countersAfter: snapshotSharpCounters(),
        countersBefore: snapshotSharpCounters(),
        durationMs: null,
        failureReasons: [],
        finishedAt: null,
        memory: monitor.snapshot(),
        results: [],
        startedAt: new Date().toISOString(),
        status: "PASS"
      };
      const candidateStartedAt = performance.now();

      report.candidates.push(candidateResult);
      monitor.start();
      try {
        for (const fixture of config.selectedFixtures) {
          if (runtimeExceeded(startedAtMs, config.maxRuntimeMs)) {
            report.stopped = true;
            break;
          }

          const prepared = {
            ...fixture,
            estimatedDecodedBytes: estimateDecodedBytes(fixture),
            source: await createPatternImage(fixture)
          };
          const fixtureResult = createFixtureResult(prepared, config.repetitions);

          candidateResult.results.push(fixtureResult);
          await writeBenchmarkOutput(config.outputPath, updateReport(report, startedAtMs));
          await runFixture({
            candidate: candidateResult,
            config,
            fixture: prepared,
            fixtureResult,
            onProgress: async () => {
              candidateResult.cacheAfter = snapshotSharpCache();
              candidateResult.countersAfter = snapshotSharpCounters();
              candidateResult.memory = monitor.snapshot();
              await writeBenchmarkOutput(config.outputPath, updateReport(report, startedAtMs));
            },
            processor,
            scriptStartedAt: startedAtMs
          });

          if (fixtureResult.stopped) {
            report.stopped = true;
            break;
          }
        }
      } finally {
        monitor.stop();
        candidateResult.cacheAfter = snapshotSharpCache();
        candidateResult.countersAfter = snapshotSharpCounters();
        candidateResult.memory = monitor.snapshot();
        candidateResult.finishedAt = new Date().toISOString();
        candidateResult.durationMs = Math.round(performance.now() - candidateStartedAt);
        await writeBenchmarkOutput(config.outputPath, updateReport(report, startedAtMs));
      }
    }
  } catch (error) {
    report.runtimeFailureReasons.push(`benchmark runtime error: ${readSafeErrorCode(error)}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    report.durationMs = Math.round(performance.now() - startedAtMs);
    updateReport(report, startedAtMs);
    await writeBenchmarkOutput(config.outputPath, report);
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") {
    process.exitCode = report.status === "STOPPED" ? 124 : 1;
  }
}

async function runFixture(input: {
  candidate: CandidateResult;
  config: BenchmarkConfig;
  fixture: PreparedFixture;
  fixtureResult: FixtureResult;
  onProgress: () => Promise<void>;
  processor: ReturnType<typeof createSharpImageProcessor>;
  scriptStartedAt: number;
}): Promise<void> {
  for (let repetition = 0; repetition < input.config.repetitions; repetition += 1) {
    if (runtimeExceeded(input.scriptStartedAt, input.config.maxRuntimeMs)) {
      input.fixtureResult.stopped = true;
      await input.onProgress();
      break;
    }

    const before = snapshotMemory();
    const processed = await runOneProcessing(input.processor, input.fixture);
    const afterProcessingBeforeGc = snapshotMemory();
    const afterGcWithDuration = await collectAfterGcSnapshot();
    const sample: BenchmarkRepetitionMemorySample = {
      afterGc: afterGcWithDuration?.snapshot ?? null,
      afterProcessingBeforeGc,
      before,
      gcDurationMs: afterGcWithDuration?.durationMs ?? null,
      processingDurationMs: processed.durationMs,
      repetition
    };

    input.fixtureResult.repetitionsAttempted += 1;
    input.fixtureResult.memorySamples.push({
      arrayBuffers: afterProcessingBeforeGc.arrayBuffers,
      external: afterProcessingBeforeGc.external,
      heapUsed: afterProcessingBeforeGc.heapUsed,
      repetition,
      rss: afterProcessingBeforeGc.rss
    });
    input.fixtureResult.samples.push(sample);
    input.fixtureResult.peakRssBytes = Math.max(
      input.fixtureResult.peakRssBytes,
      before.rss,
      afterProcessingBeforeGc.rss,
      sample.afterGc?.rss ?? 0
    );

    if (processed.errorCode === null) {
      input.fixtureResult.durationMs = summarizeDurations([
        ...readCompletedDurations(input.fixtureResult),
        processed.durationMs
      ]);
    } else {
      input.fixtureResult.failures.push({
        code: processed.errorCode,
        repetition
      });
      if (processed.errorCode === "IMAGE_PROCESSING_TIMEOUT") {
        input.fixtureResult.timeoutCount += 1;
      }
    }

    if (
      afterProcessingBeforeGc.sharpCounters.process > before.sharpCounters.process ||
      afterProcessingBeforeGc.sharpCounters.queue > before.sharpCounters.queue ||
      (sample.afterGc !== null &&
        (sample.afterGc.sharpCounters.process > before.sharpCounters.process ||
          sample.afterGc.sharpCounters.queue > before.sharpCounters.queue))
    ) {
      input.fixtureResult.sharpCounterLeaks += 1;
    }

    refreshFixtureDerivedFields(input.fixtureResult, input.candidate);
    await input.onProgress();
  }
}

async function runOneProcessing(
  processor: ReturnType<typeof createSharpImageProcessor>,
  fixture: PreparedFixture
): Promise<{ durationMs: number; errorCode: string | null }> {
  const startedAt = performance.now();

  try {
    const processed = await processor.process({
      assetId: fixture.assetId,
      declaredMimeType: `image/${fixture.format}`,
      siteId,
      slot: "gallery",
      source: fixture.source
    });
    const variantCount = processed.variants.length;

    if (variantCount === 0) {
      throw new Error("benchmark generated no variants");
    }

    return {
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: null
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: readSafeErrorCode(error)
    };
  }
}

function createFixtureResult(
  fixture: PreparedFixture,
  repetitionsRequested: number
): FixtureResult {
  return {
    acceptance: {
      classification: "STABLE",
      failureReasons: [],
      status: "PASS"
    },
    decodedMemory: {
      bytesPerChannel: fixture.bytesPerChannel,
      channels: fixture.channels,
      estimatedDecodedBytes: fixture.estimatedDecodedBytes
    },
    durationMs: summarizeDurations([]),
    errorCount: 0,
    failures: [],
    format: fixture.format,
    inputBytes: fixture.source.length,
    label: fixture.label,
    memoryAfter: process.memoryUsage(),
    memorySamples: [],
    originalHeight: fixture.height,
    originalPixels: fixture.width * fixture.height,
    originalWidth: fixture.width,
    peakRssBytes: 0,
    repetitionsAttempted: 0,
    repetitionsRequested,
    rssDeltaBytes: 0,
    rssMonotonicIncreaseCount: 0,
    rssStrictlyMonotonicGrowth: false,
    samples: [],
    sharpCounterLeaks: 0,
    stopped: false,
    summary: summarizeMemorySamples([]),
    timeoutCount: 0
  };
}

function refreshFixtureDerivedFields(
  fixtureResult: FixtureResult,
  candidate: CandidateResult
): void {
  const rssValues = fixtureResult.memorySamples.map((sample) => sample.rss);

  fixtureResult.errorCount = fixtureResult.failures.length;
  fixtureResult.memoryAfter = process.memoryUsage();
  fixtureResult.rssDeltaBytes =
    rssValues.length < 2 ? 0 : (rssValues[rssValues.length - 1] as number) - (rssValues[0] as number);
  fixtureResult.rssMonotonicIncreaseCount = countMonotonicIncreases(rssValues);
  fixtureResult.rssStrictlyMonotonicGrowth = isStrictlyMonotonicGrowth(rssValues);
  fixtureResult.summary = summarizeMemorySamples(fixtureResult.samples);
  fixtureResult.acceptance = decideBenchmarkAcceptance({
    cacheAfter: candidate.cacheAfter,
    cacheCandidate: candidate.cacheCandidate,
    countersAfter: candidate.countersAfter,
    countersBefore: candidate.countersBefore,
    errorCount: fixtureResult.errorCount,
    failures: fixtureResult.failures,
    fixture: fixtureResult.label,
    gcAvailable: typeof (globalThis as { gc?: unknown }).gc === "function",
    peakRssBytes: fixtureResult.peakRssBytes,
    requestedRepetitions: fixtureResult.repetitionsRequested,
    samples: fixtureResult.samples,
    sharpCounterLeaks: fixtureResult.sharpCounterLeaks,
    stopped: fixtureResult.stopped,
    timeoutCount: fixtureResult.timeoutCount
  });
}

function readCompletedDurations(fixtureResult: FixtureResult): number[] {
  return fixtureResult.samples
    .map((sample) => sample.processingDurationMs)
    .filter((value): value is number => value !== null);
}

function updateReport(report: BenchmarkReport, startedAtMs: number): BenchmarkReport {
  const failureReasons: string[] = [...report.runtimeFailureReasons];

  report.completedRepetitions = 0;
  for (const candidate of report.candidates) {
    const candidateReasons: string[] = [];

    for (const result of candidate.results) {
      report.completedRepetitions += result.repetitionsAttempted;
      result.acceptance = decideBenchmarkAcceptance({
        cacheAfter: candidate.cacheAfter,
        cacheCandidate: candidate.cacheCandidate,
        countersAfter: candidate.countersAfter,
        countersBefore: candidate.countersBefore,
        errorCount: result.errorCount,
        failures: result.failures,
        fixture: result.label,
        gcAvailable: report.gcAvailable,
        peakRssBytes: Math.max(result.peakRssBytes, candidate.memory.peakRss),
        requestedRepetitions: result.repetitionsRequested,
        samples: result.samples,
        sharpCounterLeaks: result.sharpCounterLeaks,
        stopped: result.stopped,
        timeoutCount: result.timeoutCount
      });
      for (const reason of result.acceptance.failureReasons) {
        candidateReasons.push(`${result.label}/${candidate.cacheCandidate}: ${reason}`);
      }
    }

    candidate.failureReasons = candidateReasons;
    candidate.status = report.stopped
      ? "STOPPED"
      : candidateReasons.length === 0
        ? "PASS"
        : "FAIL";
    failureReasons.push(...candidateReasons);
  }

  report.durationMs = Math.round(performance.now() - startedAtMs);
  report.failureReasons = [...new Set(failureReasons)];
  report.status = report.stopped
    ? "STOPPED"
    : report.failureReasons.length === 0
      ? "PASS"
      : "FAIL";

  return report;
}

async function collectAfterGcSnapshot(): Promise<{
  durationMs: number;
  snapshot: BenchmarkRepetitionMemorySample["afterGc"];
} | null> {
  const gc = (globalThis as { gc?: () => void }).gc;

  if (typeof gc !== "function") {
    return null;
  }

  const startedAt = performance.now();

  await waitImmediate();
  gc();
  await waitImmediate();
  gc();
  await waitImmediate();

  return {
    durationMs: Math.round(performance.now() - startedAt),
    snapshot: snapshotMemory()
  };
}

function snapshotMemory(): BenchmarkRepetitionMemorySample["before"] {
  const memory = process.memoryUsage();

  return {
    arrayBuffers: memory.arrayBuffers,
    external: memory.external,
    heapUsed: memory.heapUsed,
    rss: memory.rss,
    sharpCache: snapshotSharpCache(),
    sharpCounters: snapshotSharpCounters()
  };
}

function snapshotSharpCache(): SharpCacheSnapshot {
  return sharp.cache() as SharpCacheSnapshot;
}

function snapshotSharpCounters(): SharpCountersSnapshot {
  return sharp.counters() as SharpCountersSnapshot;
}

function countMonotonicIncreases(values: readonly number[]): number {
  let increases = 0;

  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) > (values[index - 1] as number)) {
      increases += 1;
    }
  }

  return increases;
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
    p99: sorted.length >= 30 ? Math.round(percentile(sorted, 0.99)) : null
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
  return input.width * input.height * input.channels * input.bytesPerChannel;
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

  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

function readBenchmarkConfig(): BenchmarkConfig {
  return {
    maxRuntimeMs: readOptionalPositiveInteger(process.env.IMAGE_BENCH_MAX_RUNTIME_MS),
    outputPath: readOptionalPath(process.env.IMAGE_BENCH_OUTPUT),
    repetitions: readPositiveInteger(process.env.IMAGE_BENCH_REPETITIONS, 30),
    selectedCaches: selectByLabel(
      cacheCandidates,
      process.env.IMAGE_BENCH_CACHE,
      "IMAGE_BENCH_CACHE"
    ),
    selectedFixtures: selectByLabel(
      fixtures,
      process.env.IMAGE_BENCH_FIXTURE,
      "IMAGE_BENCH_FIXTURE"
    )
  };
}

function selectByLabel<T extends { label: string }>(
  values: readonly T[],
  rawSelector: string | undefined,
  envName: string
): T[] {
  const selectors = parseSelector(rawSelector);

  if (selectors.length === 0) {
    return [...values];
  }

  const byLabel = new Map(values.map((value) => [value.label, value]));
  const selected = selectors.map((selector) => byLabel.get(selector));
  const missing = selectors.filter((selector, index) => selected[index] === undefined);

  if (missing.length > 0) {
    throw new Error(`${envName} contains unknown label(s): ${missing.join(", ")}`);
  }

  return selected as T[];
}

function parseSelector(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "" || value.trim() === "*") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function runtimeExceeded(startedAt: number, maxRuntimeMs: number | null): boolean {
  return maxRuntimeMs !== null && performance.now() - startedAt >= maxRuntimeMs;
}

async function writeBenchmarkOutput(
  outputPath: string | null,
  result: BenchmarkReport
): Promise<void> {
  if (outputPath === null) {
    return;
  }

  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

function readSafeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return "UNKNOWN_ERROR";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalPositiveInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("IMAGE_BENCH_MAX_RUNTIME_MS must be a positive integer.");
  }

  return parsed;
}

function readOptionalPath(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];

  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  await main();
}
