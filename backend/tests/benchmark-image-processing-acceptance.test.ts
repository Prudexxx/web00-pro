import { describe, expect, it } from "vitest";
import {
  BENCHMARK_MIB,
  calculateLinearSlope,
  calculateTailRange,
  decideBenchmarkAcceptance,
  isStrictlyMonotonicGrowth,
  summarizeMemorySamples,
  type BenchmarkAcceptanceCandidate,
  type BenchmarkRepetitionMemorySample
} from "../scripts/benchmark-image-processing-acceptance.js";

describe("image benchmark acceptance helpers", () => {
  it("detects strict monotonic growth only when every adjacent value increases", () => {
    expect(isStrictlyMonotonicGrowth([1, 2, 3, 4])).toBe(true);
    expect(isStrictlyMonotonicGrowth([1, 2, 2, 4])).toBe(false);
    expect(isStrictlyMonotonicGrowth([4, 3, 2, 1])).toBe(false);
    expect(isStrictlyMonotonicGrowth([1])).toBe(false);
  });

  it("calculates linear slope and tail range in bytes per repetition", () => {
    expect(calculateLinearSlope([0, BENCHMARK_MIB, 2 * BENCHMARK_MIB])).toBe(
      BENCHMARK_MIB
    );
    expect(calculateLinearSlope([10 * BENCHMARK_MIB, 10 * BENCHMARK_MIB])).toBe(0);
    expect(calculateTailRange(
      [1, 2, 20, 30, 40, 50].map((value) => value * BENCHMARK_MIB),
      5
    )).toBe(48 * BENCHMARK_MIB);
  });

  it("classifies pre-GC RSS growth with stable post-GC memory as allocator retention", () => {
    const candidate = createCandidate({
      afterGcArrayBuffers: stableBytes(10, 4 * BENCHMARK_MIB),
      afterGcExternal: stableBytes(10, 12 * BENCHMARK_MIB),
      afterGcRss: stableBytes(10, 110 * BENCHMARK_MIB),
      beforeRss: increasingBytes(10, 80 * BENCHMARK_MIB, 2 * BENCHMARK_MIB),
      fixture: "alpha-webp",
      preGcRss: increasingBytes(10, 90 * BENCHMARK_MIB, 3 * BENCHMARK_MIB)
    });

    const decision = decideBenchmarkAcceptance(candidate);

    expect(decision).toMatchObject({
      classification: "GC_DELAYED_OR_ALLOCATOR_RETENTION",
      status: "PASS"
    });
    expect(decision.failureReasons).toEqual([]);
  });

  it("fails when post-GC external memory keeps growing after warm-up", () => {
    const candidate = createCandidate({
      afterGcArrayBuffers: stableBytes(10, 4 * BENCHMARK_MIB),
      afterGcExternal: increasingBytes(10, 12 * BENCHMARK_MIB, 3 * BENCHMARK_MIB),
      afterGcRss: stableBytes(10, 110 * BENCHMARK_MIB),
      fixture: "alpha-webp",
      preGcRss: increasingBytes(10, 90 * BENCHMARK_MIB, 3 * BENCHMARK_MIB)
    });

    const decision = decideBenchmarkAcceptance(candidate);

    expect(decision).toMatchObject({
      classification: "REAL_OR_HARNESS_RETENTION_REQUIRES_FIX",
      status: "FAIL"
    });
    expect(decision.failureReasons.join("\n")).toContain("post-gc external");
  });

  it("uses a higher RSS ceiling only for the near-supported 16MP fixture", () => {
    expect(
      decideBenchmarkAcceptance(createCandidate({
        afterGcArrayBuffers: stableBytes(10, 4 * BENCHMARK_MIB),
        afterGcExternal: stableBytes(10, 12 * BENCHMARK_MIB),
        afterGcRss: stableBytes(10, 300 * BENCHMARK_MIB),
        fixture: "alpha-webp",
        peakRssBytes: 300 * BENCHMARK_MIB,
        preGcRss: stableBytes(10, 300 * BENCHMARK_MIB)
      })).status
    ).toBe("FAIL");
    expect(
      decideBenchmarkAcceptance(createCandidate({
        afterGcArrayBuffers: stableBytes(10, 4 * BENCHMARK_MIB),
        afterGcExternal: stableBytes(10, 12 * BENCHMARK_MIB),
        afterGcRss: stableBytes(10, 300 * BENCHMARK_MIB),
        fixture: "near-supported-16mp-png",
        peakRssBytes: 300 * BENCHMARK_MIB,
        preGcRss: stableBytes(10, 300 * BENCHMARK_MIB)
      })).status
    ).toBe("PASS");
  });

  it("summarizes post-GC and pre-GC memory trends separately", () => {
    const samples = createSamples({
      afterGcArrayBuffers: stableBytes(10, 3 * BENCHMARK_MIB),
      afterGcExternal: stableBytes(10, 8 * BENCHMARK_MIB),
      afterGcRss: stableBytes(10, 120 * BENCHMARK_MIB),
      preGcRss: increasingBytes(10, 90 * BENCHMARK_MIB, BENCHMARK_MIB)
    });

    expect(summarizeMemorySamples(samples)).toMatchObject({
      postGcArrayBuffersDeltaBytes: 0,
      postGcExternalDeltaBytes: 0,
      preGcRssStrictlyMonotonicGrowth: true
    });
  });
});

function createCandidate(input: {
  afterGcArrayBuffers: number[];
  afterGcExternal: number[];
  afterGcRss: number[];
  beforeRss?: number[] | undefined;
  fixture: string;
  peakRssBytes?: number | undefined;
  preGcRss: number[];
}): BenchmarkAcceptanceCandidate {
  return {
    cacheAfter: cacheSnapshot("disabled"),
    cacheCandidate: "disabled",
    countersAfter: { process: 0, queue: 0 },
    countersBefore: { process: 0, queue: 0 },
    errorCount: 0,
    failures: [],
    fixture: input.fixture,
    gcAvailable: true,
    peakRssBytes: input.peakRssBytes ?? Math.max(...input.preGcRss, ...input.afterGcRss),
    requestedRepetitions: input.preGcRss.length,
    samples: createSamples(input),
    sharpCounterLeaks: 0,
    stopped: false,
    timeoutCount: 0
  };
}

function createSamples(input: {
  afterGcArrayBuffers: number[];
  afterGcExternal: number[];
  afterGcRss: number[];
  beforeRss?: number[] | undefined;
  preGcRss: number[];
}): BenchmarkRepetitionMemorySample[] {
  return input.preGcRss.map((rss, repetition) => ({
    afterGc: {
      arrayBuffers: input.afterGcArrayBuffers[repetition] ?? 0,
      external: input.afterGcExternal[repetition] ?? 0,
      heapUsed: 10 * BENCHMARK_MIB,
      rss: input.afterGcRss[repetition] ?? rss,
      sharpCache: cacheSnapshot("disabled"),
      sharpCounters: { process: 0, queue: 0 }
    },
    afterProcessingBeforeGc: {
      arrayBuffers: 20 * BENCHMARK_MIB + repetition * BENCHMARK_MIB,
      external: 30 * BENCHMARK_MIB + repetition * BENCHMARK_MIB,
      heapUsed: 12 * BENCHMARK_MIB,
      rss,
      sharpCache: cacheSnapshot("disabled"),
      sharpCounters: { process: 0, queue: 0 }
    },
    before: {
      arrayBuffers: 2 * BENCHMARK_MIB,
      external: 4 * BENCHMARK_MIB,
      heapUsed: 8 * BENCHMARK_MIB,
      rss: input.beforeRss?.[repetition] ?? 80 * BENCHMARK_MIB,
      sharpCache: cacheSnapshot("disabled"),
      sharpCounters: { process: 0, queue: 0 }
    },
    gcDurationMs: 3,
    processingDurationMs: 12,
    repetition
  }));
}

function stableBytes(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
}

function increasingBytes(length: number, first: number, step: number): number[] {
  return Array.from({ length }, (_value, index) => first + index * step);
}

function cacheSnapshot(label: "disabled" | "memory-16mb" | "memory-32mb") {
  const max = label === "memory-32mb" ? 32 : label === "memory-16mb" ? 16 : 0;

  return {
    files: { current: 0, max: 0 },
    items: { current: 0, max: 0 },
    memory: { current: 0, high: 0, max }
  };
}
