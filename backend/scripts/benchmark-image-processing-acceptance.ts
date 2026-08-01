export const BENCHMARK_MIB = 1024 * 1024;

export type BenchmarkMemorySnapshot = {
  arrayBuffers: number;
  external: number;
  heapUsed: number;
  rss: number;
  sharpCache: SharpCacheSnapshot;
  sharpCounters: SharpCountersSnapshot;
};

export type BenchmarkRepetitionMemorySample = {
  afterGc: BenchmarkMemorySnapshot | null;
  afterProcessingBeforeGc: BenchmarkMemorySnapshot;
  before: BenchmarkMemorySnapshot;
  gcDurationMs: number | null;
  processingDurationMs: number | null;
  repetition: number;
};

export type SharpCacheSnapshot = {
  files: {
    current: number;
    max: number;
  };
  items: {
    current: number;
    max: number;
  };
  memory: {
    current: number;
    high: number;
    max: number;
  };
};

export type SharpCountersSnapshot = {
  process: number;
  queue: number;
};

export type BenchmarkAcceptanceCandidate = {
  cacheAfter: SharpCacheSnapshot;
  cacheCandidate: string;
  countersAfter: SharpCountersSnapshot;
  countersBefore: SharpCountersSnapshot;
  errorCount: number;
  failures: Array<{ code: string; repetition: number }>;
  fixture: string;
  gcAvailable: boolean;
  peakRssBytes: number;
  requestedRepetitions: number;
  samples: BenchmarkRepetitionMemorySample[];
  sharpCounterLeaks: number;
  stopped: boolean;
  timeoutCount: number;
};

export type MemorySampleSummary = {
  afterGcMissingCount: number;
  postGcArrayBuffersDeltaBytes: number | null;
  postGcArrayBuffersSlopeBytesPerRepetition: number | null;
  postGcArrayBuffersTailRangeBytes: number | null;
  postGcExternalDeltaBytes: number | null;
  postGcExternalSlopeBytesPerRepetition: number | null;
  postGcExternalTailRangeBytes: number | null;
  postGcRssDeltaBytes: number | null;
  postGcRssTailSlopeBytesPerRepetition: number | null;
  preGcRssStrictlyMonotonicGrowth: boolean;
};

export type BenchmarkAcceptanceClassification =
  | "GC_DELAYED_OR_ALLOCATOR_RETENTION"
  | "REAL_OR_HARNESS_RETENTION_REQUIRES_FIX"
  | "STABLE";

export type BenchmarkAcceptanceDecision = {
  classification: BenchmarkAcceptanceClassification;
  failureReasons: string[];
  status: "FAIL" | "PASS";
};

const REPEATED_SAMPLE_MINIMUM = 10;
const WARM_UP_SAMPLE_COUNT = 2;
const TAIL_SAMPLE_COUNT = 5;
const ORDINARY_PEAK_RSS_LIMIT_BYTES = 256 * BENCHMARK_MIB;
const NEAR_16MP_PEAK_RSS_LIMIT_BYTES = 320 * BENCHMARK_MIB;
const HARD_PEAK_RSS_LIMIT_BYTES = 384 * BENCHMARK_MIB;
const POST_GC_EXTERNAL_DELTA_LIMIT_BYTES = 16 * BENCHMARK_MIB;
const POST_GC_EXTERNAL_SLOPE_LIMIT_BYTES = 0.5 * BENCHMARK_MIB;
const POST_GC_EXTERNAL_TAIL_RANGE_LIMIT_BYTES = 16 * BENCHMARK_MIB;
const POST_GC_ARRAY_BUFFERS_DELTA_LIMIT_BYTES = 8 * BENCHMARK_MIB;
const POST_GC_ARRAY_BUFFERS_SLOPE_LIMIT_BYTES = 0.5 * BENCHMARK_MIB;
const POST_GC_ARRAY_BUFFERS_TAIL_RANGE_LIMIT_BYTES = 8 * BENCHMARK_MIB;
const POST_GC_RSS_DELTA_LIMIT_BYTES = 64 * BENCHMARK_MIB;
const POST_GC_RSS_TAIL_SLOPE_LIMIT_BYTES = 2 * BENCHMARK_MIB;

export function isStrictlyMonotonicGrowth(values: readonly number[]): boolean {
  return (
    values.length > 1 &&
    values.every((value, index) => index === 0 || value > (values[index - 1] as number))
  );
}

export function calculateLinearSlope(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < values.length; index += 1) {
    const xDelta = index - xMean;
    const yDelta = (values[index] as number) - yMean;

    numerator += xDelta * yDelta;
    denominator += xDelta * xDelta;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

export function calculateTailRange(
  values: readonly number[],
  tailSize: number
): number {
  if (values.length === 0 || tailSize <= 0) {
    return 0;
  }

  const tail = values.slice(Math.max(0, values.length - tailSize));

  return Math.max(...tail) - Math.min(...tail);
}

export function summarizeMemorySamples(
  samples: readonly BenchmarkRepetitionMemorySample[]
): MemorySampleSummary {
  const preGcRss = samples.map((sample) => sample.afterProcessingBeforeGc.rss);
  const postGcSamples = samples
    .map((sample) => sample.afterGc)
    .filter((sample): sample is BenchmarkMemorySnapshot => sample !== null);
  const trendSamples = postGcSamples.slice(WARM_UP_SAMPLE_COUNT);
  const postGcExternal = trendSamples.map((sample) => sample.external);
  const postGcArrayBuffers = trendSamples.map((sample) => sample.arrayBuffers);
  const postGcRss = trendSamples.map((sample) => sample.rss);

  return {
    afterGcMissingCount: samples.length - postGcSamples.length,
    postGcArrayBuffersDeltaBytes: calculateDelta(postGcArrayBuffers),
    postGcArrayBuffersSlopeBytesPerRepetition: calculateNullableSlope(postGcArrayBuffers),
    postGcArrayBuffersTailRangeBytes: calculateNullableTailRange(postGcArrayBuffers),
    postGcExternalDeltaBytes: calculateDelta(postGcExternal),
    postGcExternalSlopeBytesPerRepetition: calculateNullableSlope(postGcExternal),
    postGcExternalTailRangeBytes: calculateNullableTailRange(postGcExternal),
    postGcRssDeltaBytes: calculateDelta(postGcRss),
    postGcRssTailSlopeBytesPerRepetition: calculateNullableSlope(
      postGcRss.slice(Math.max(0, postGcRss.length - TAIL_SAMPLE_COUNT))
    ),
    preGcRssStrictlyMonotonicGrowth: isStrictlyMonotonicGrowth(preGcRss)
  };
}

export function validateBenchmarkCandidate(
  candidate: BenchmarkAcceptanceCandidate
): string[] {
  const failureReasons: string[] = [];
  const peakLimit = readPeakRssLimit(candidate.fixture);

  if (candidate.errorCount > 0) {
    failureReasons.push(`errors > 0 (${candidate.errorCount})`);
  }
  if (candidate.timeoutCount > 0) {
    failureReasons.push(`timeoutCount > 0 (${candidate.timeoutCount})`);
  }
  if (candidate.stopped) {
    failureReasons.push("stopped=true");
  }
  if (candidate.samples.length !== candidate.requestedRepetitions) {
    failureReasons.push(
      `missing sample: expected ${candidate.requestedRepetitions}, got ${candidate.samples.length}`
    );
  }
  if (candidate.sharpCounterLeaks > 0) {
    failureReasons.push(`sharpCounterLeaks > 0 (${candidate.sharpCounterLeaks})`);
  }
  if (candidate.countersAfter.process !== candidate.countersBefore.process) {
    failureReasons.push("candidate sharp process counter did not return to baseline");
  }
  if (candidate.countersAfter.queue !== candidate.countersBefore.queue) {
    failureReasons.push("candidate sharp queue counter did not return to baseline");
  }
  if (candidate.peakRssBytes > HARD_PEAK_RSS_LIMIT_BYTES) {
    failureReasons.push(
      `peak RSS exceeds hard limit (${candidate.peakRssBytes} > ${HARD_PEAK_RSS_LIMIT_BYTES})`
    );
  }
  if (candidate.peakRssBytes > peakLimit) {
    failureReasons.push(
      `peak RSS exceeds fixture limit (${candidate.peakRssBytes} > ${peakLimit})`
    );
  }
  if (candidate.cacheAfter.memory.max > readCacheLimitMiB(candidate.cacheCandidate)) {
    failureReasons.push("configured Sharp cache exceeds selected cache policy");
  }

  for (const sample of candidate.samples) {
    if (sample.afterGc === null && candidate.gcAvailable) {
      failureReasons.push(`missing afterGc sample at repetition ${sample.repetition}`);
      continue;
    }

    const finalCounters = sample.afterGc?.sharpCounters ??
      sample.afterProcessingBeforeGc.sharpCounters;

    if (finalCounters.process !== sample.before.sharpCounters.process) {
      failureReasons.push(
        `afterGc sharp process counter did not return to baseline at repetition ${sample.repetition}`
      );
    }
    if (finalCounters.queue !== sample.before.sharpCounters.queue) {
      failureReasons.push(
        `afterGc sharp queue counter did not return to baseline at repetition ${sample.repetition}`
      );
    }
  }

  return failureReasons;
}

export function decideBenchmarkAcceptance(
  candidate: BenchmarkAcceptanceCandidate
): BenchmarkAcceptanceDecision {
  const failureReasons = validateBenchmarkCandidate(candidate);
  const summary = summarizeMemorySamples(candidate.samples);
  let classification: BenchmarkAcceptanceClassification = "STABLE";

  if (
    candidate.requestedRepetitions >= REPEATED_SAMPLE_MINIMUM &&
    candidate.gcAvailable &&
    summary.afterGcMissingCount === 0
  ) {
    if (
      exceeds(summary.postGcExternalDeltaBytes, POST_GC_EXTERNAL_DELTA_LIMIT_BYTES) ||
      exceeds(summary.postGcExternalSlopeBytesPerRepetition, POST_GC_EXTERNAL_SLOPE_LIMIT_BYTES) ||
      exceeds(summary.postGcExternalTailRangeBytes, POST_GC_EXTERNAL_TAIL_RANGE_LIMIT_BYTES)
    ) {
      classification = "REAL_OR_HARNESS_RETENTION_REQUIRES_FIX";
      failureReasons.push("post-gc external memory exceeded stability gates");
    }
    if (
      exceeds(summary.postGcArrayBuffersDeltaBytes, POST_GC_ARRAY_BUFFERS_DELTA_LIMIT_BYTES) ||
      exceeds(
        summary.postGcArrayBuffersSlopeBytesPerRepetition,
        POST_GC_ARRAY_BUFFERS_SLOPE_LIMIT_BYTES
      ) ||
      exceeds(summary.postGcArrayBuffersTailRangeBytes, POST_GC_ARRAY_BUFFERS_TAIL_RANGE_LIMIT_BYTES)
    ) {
      classification = "REAL_OR_HARNESS_RETENTION_REQUIRES_FIX";
      failureReasons.push("post-gc arrayBuffers memory exceeded stability gates");
    }
    if (exceeds(summary.postGcRssDeltaBytes, POST_GC_RSS_DELTA_LIMIT_BYTES)) {
      failureReasons.push("post-gc RSS exceeded final-vs-first stability gate");
    }
    if (exceeds(summary.postGcRssTailSlopeBytesPerRepetition, POST_GC_RSS_TAIL_SLOPE_LIMIT_BYTES)) {
      failureReasons.push("post-gc RSS tail slope exceeded stability gate");
    }
    if (
      classification === "STABLE" &&
      summary.preGcRssStrictlyMonotonicGrowth &&
      failureReasons.length === 0
    ) {
      classification = "GC_DELAYED_OR_ALLOCATOR_RETENTION";
    }
  } else if (
    candidate.requestedRepetitions >= REPEATED_SAMPLE_MINIMUM &&
    !candidate.gcAvailable &&
    summary.preGcRssStrictlyMonotonicGrowth
  ) {
    failureReasons.push("pre-GC RSS strictly increased and GC evidence is unavailable");
  }

  return {
    classification,
    failureReasons,
    status: failureReasons.length === 0 ? "PASS" : "FAIL"
  };
}

function calculateDelta(values: readonly number[]): number | null {
  if (values.length < 2) {
    return values.length === 1 ? 0 : null;
  }

  return (values[values.length - 1] as number) - (values[0] as number);
}

function calculateNullableSlope(values: readonly number[]): number | null {
  return values.length === 0 ? null : calculateLinearSlope(values);
}

function calculateNullableTailRange(values: readonly number[]): number | null {
  return values.length === 0 ? null : calculateTailRange(values, TAIL_SAMPLE_COUNT);
}

function exceeds(value: number | null, limit: number): boolean {
  return value !== null && value > limit;
}

function readPeakRssLimit(fixture: string): number {
  return fixture === "near-supported-16mp-png"
    ? NEAR_16MP_PEAK_RSS_LIMIT_BYTES
    : ORDINARY_PEAK_RSS_LIMIT_BYTES;
}

function readCacheLimitMiB(cacheCandidate: string): number {
  if (cacheCandidate === "memory-16mb") {
    return 16;
  }
  if (cacheCandidate === "memory-32mb") {
    return 32;
  }

  return 0;
}
