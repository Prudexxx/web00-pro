import { describe, expect, it, vi } from "vitest";
import { createPublicCatalogReconciler } from "../src/modules/public-catalog/public-catalog-reconciler.js";

describe("public catalog reconciler", () => {
  it("coalesces rapid triggers into one active sync and one follow-up pass", async () => {
    let requestIndex = 0;
    const syncOnce = vi.fn()
      .mockResolvedValueOnce({
        desiredRevision: 2,
        publishedRevision: 1,
        requestId: "req-sync-1",
        status: "pending"
      })
      .mockResolvedValueOnce({
        desiredRevision: 2,
        itemsCount: 17,
        publishedRevision: 2,
        requestId: "req-sync-2",
        snapshotPath: `runtime/production/catalog/v1/releases/revision-2-${"a".repeat(64)}.json`,
        status: "ready"
      });
    const reconciler = createPublicCatalogReconciler({
      createRequestId: () => {
        requestIndex += 1;
        return `req-sync-${requestIndex}`;
      },
      initialDelayMs: 0,
      maxDelayMs: 1,
      syncService: { syncOnce }
    });

    reconciler.requestReconcile({ reason: "site.publish", requestId: "admin-1" });
    reconciler.requestReconcile({ reason: "site.update", requestId: "admin-2" });
    await reconciler.drainForTest();

    expect(syncOnce).toHaveBeenCalledTimes(2);
    expect(syncOnce).toHaveBeenNthCalledWith(1, { requestId: "req-sync-1" });
    expect(syncOnce).toHaveBeenNthCalledWith(2, { requestId: "req-sync-2" });
  });

  it("bounds retry after failed publication", async () => {
    const syncOnce = vi.fn().mockResolvedValue({
      desiredRevision: 3,
      errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      publishedRevision: 2,
      requestId: "req-fail",
      status: "failed"
    });
    const reconciler = createPublicCatalogReconciler({
      createRequestId: () => "req-fail",
      initialDelayMs: 0,
      maxAttempts: 3,
      maxDelayMs: 1,
      syncService: { syncOnce }
    });

    reconciler.requestReconcile({ reason: "startup", requestId: "startup" });
    await reconciler.drainForTest();

    expect(syncOnce).toHaveBeenCalledTimes(3);
  });

  it("retries a pending startup sync without requiring another external trigger", async () => {
    const syncOnce = vi.fn()
      .mockResolvedValueOnce({
        desiredRevision: 4,
        publishedRevision: 3,
        requestId: "req-pending",
        status: "pending"
      })
      .mockResolvedValueOnce({
        desiredRevision: 4,
        itemsCount: 5,
        publishedRevision: 4,
        requestId: "req-ready",
        snapshotPath: `runtime/production/catalog/v1/releases/revision-4-${"b".repeat(64)}.json`,
        status: "ready"
      });
    let requestIndex = 0;
    const reconciler = createPublicCatalogReconciler({
      createRequestId: () => {
        requestIndex += 1;
        return requestIndex === 1 ? "req-pending" : "req-ready";
      },
      initialDelayMs: 0,
      maxAttempts: 2,
      maxDelayMs: 1,
      syncService: { syncOnce }
    });

    reconciler.start();
    await reconciler.drainForTest();

    expect(syncOnce).toHaveBeenCalledTimes(2);
    expect(syncOnce).toHaveBeenNthCalledWith(1, { requestId: "req-pending" });
    expect(syncOnce).toHaveBeenNthCalledWith(2, { requestId: "req-ready" });
  });

  it("cancels pending retry backoff when stopped", async () => {
    vi.useFakeTimers();
    try {
      const syncOnce = vi.fn().mockResolvedValue({
        desiredRevision: 4,
        publishedRevision: 3,
        requestId: "req-pending",
        status: "pending"
      });
      const reconciler = createPublicCatalogReconciler({
        createRequestId: () => "req-pending",
        initialDelayMs: 10_000,
        maxAttempts: 2,
        maxDelayMs: 10_000,
        syncService: { syncOnce }
      });

      reconciler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(syncOnce).toHaveBeenCalledTimes(1);

      const stop = reconciler.stop().then(() => "stopped");
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();

      await expect(Promise.race([stop, Promise.resolve("blocked")])).resolves.toBe("stopped");
      expect(syncOnce).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops without scheduling a new sync", async () => {
    const syncOnce = vi.fn();
    const reconciler = createPublicCatalogReconciler({
      initialDelayMs: 0,
      syncService: { syncOnce }
    });

    await reconciler.stop();
    reconciler.requestReconcile({ reason: "after-stop", requestId: "req-stop" });
    await reconciler.drainForTest();

    expect(syncOnce).not.toHaveBeenCalled();
  });
});
