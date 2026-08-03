import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  PUBLIC_CATALOG_MANIFEST_PATH,
  PUBLIC_CATALOG_STORAGE_BUCKET,
  buildPublicCatalogSnapshotPath,
  createPublicCatalogSnapshotStorage
} from "../src/modules/public-catalog/public-catalog-snapshot-storage.js";

const config = {
  bucket: "web00-catalog-images" as const,
  credentials: {
    serviceRoleKey: "service_role_value_must_not_leak",
    supabaseUrl: "https://storage.example.test"
  },
  publicBaseUrl: "https://storage.example.test",
  workerEnabled: false,
  workerPollIntervalSeconds: 60 as const
};

describe("public catalog snapshot storage", () => {
  it("uploads immutable versions and mutable manifest with exact upsert boundaries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const storage = createPublicCatalogSnapshotStorage(config, { fetchImpl });

    await storage.uploadJson({
      body: "{\"schemaVersion\":1}\n",
      path: buildPublicCatalogSnapshotPath(7),
      requestId: "req_storage",
      timeoutMs: 1_000,
      upsert: false
    });
    await storage.uploadJson({
      body: "{\"schemaVersion\":1}\n",
      path: PUBLIC_CATALOG_MANIFEST_PATH,
      requestId: "req_storage",
      timeoutMs: 1_000,
      upsert: true
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(PUBLIC_CATALOG_STORAGE_BUCKET).toBe("web00-public-catalog");
    expect(fetchImpl.mock.calls[0]![0].toString()).toBe(
      "https://storage.example.test/storage/v1/object/web00-public-catalog/public-catalog/v1/snapshots/revision-7.json"
    );
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-upsert": "false"
      })
    });
    expect(fetchImpl.mock.calls[1]![0].toString()).toBe(
      "https://storage.example.test/storage/v1/object/web00-public-catalog/public-catalog/v1/manifest.json"
    );
    expect(fetchImpl.mock.calls[1]![1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "cache-control": "no-cache",
        "content-type": "application/json",
        "x-upsert": "true"
      })
    });
  });

  it("fetches manifest/version text from exact public URL with cache buster and no credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{\"schemaVersion\":1}\n", {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const storage = createPublicCatalogSnapshotStorage(config, { fetchImpl });

    const text = await storage.fetchText({
      cacheBust: true,
      path: PUBLIC_CATALOG_MANIFEST_PATH,
      requestId: "req_fetch",
      timeoutMs: 1_000
    });

    const url = new URL(fetchImpl.mock.calls[0]![0].toString());
    expect(text).toBe("{\"schemaVersion\":1}\n");
    expect(url.origin).toBe("https://storage.example.test");
    expect(url.pathname).toBe(
      "/storage/v1/object/public/web00-public-catalog/public-catalog/v1/manifest.json"
    );
    expect(url.searchParams.get("v")).toMatch(/^req_fetch-/);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({
      credentials: "omit",
      method: "GET",
      redirect: "error"
    });
  });

  it("disposes failed provider bodies and returns safe storage errors", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
      start(controller) {
        controller.enqueue(new TextEncoder().encode("raw provider body with service_role_value_must_not_leak"));
      }
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 503,
        statusText: "provider raw unavailable"
      })
    );
    const storage = createPublicCatalogSnapshotStorage(config, { fetchImpl });

    await expect(
      storage.uploadJson({
        body: "{\"schemaVersion\":1}\n",
        path: buildPublicCatalogSnapshotPath(8),
        requestId: "req_error",
        timeoutMs: 1_000,
        upsert: false
      })
    ).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      message: "Public catalog storage is unavailable.",
      statusCode: 503
    });

    expect(cancelled).toBe(true);

    try {
      await storage.uploadJson({
        body: "{\"schemaVersion\":1}\n",
        path: buildPublicCatalogSnapshotPath(8),
        requestId: "req_error",
        timeoutMs: 1_000,
        upsert: false
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(JSON.stringify(error)).not.toContain("raw provider body");
      expect(JSON.stringify(error)).not.toContain("service_role_value_must_not_leak");
    }
  });

  it.each([400, 401, 403, 404, 409, 500])(
    "logs only safe upstream snapshot upload status %i",
    async (status) => {
      let cancelled = false;
      const body = new ReadableStream({
        cancel() {
          cancelled = true;
        },
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              "raw provider body token=secret service_role_value_must_not_leak storage/v1/object"
            )
          );
        }
      });
      const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status }));
      const logger = { log: vi.fn() };
      const ticks = [100, 137];
      const storage = createPublicCatalogSnapshotStorage(config, {
        fetchImpl,
        logger,
        now: () => ticks.shift() ?? 137
      });

      await expect(
        storage.uploadJson({
          body: "{\"schemaVersion\":1}\n",
          path: buildPublicCatalogSnapshotPath(9),
          requestId: "req_diag_upload",
          timeoutMs: 1_000,
          upsert: false
        })
      ).rejects.toMatchObject({
        code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
        statusCode: 503
      });

      expect(cancelled).toBe(true);
      expect(logger.log).toHaveBeenCalledWith({
        durationMs: 37,
        operation: "snapshot_upload",
        pathKind: "snapshot",
        requestId: "req_diag_upload",
        upstreamStatus: status
      });
      expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
        /token=|service_role_value_must_not_leak|authorization|apikey|storage\/v1\/object|raw provider body/i
      );
    }
  );

  it("logs manifest fetch failures without leaking provider body or URL details", async () => {
    let cancelled = false;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("provider says service_role_value_must_not_leak")
            );
          }
        }),
        { status: 403 }
      )
    );
    const logger = { log: vi.fn() };
    const ticks = [5, 13];
    const storage = createPublicCatalogSnapshotStorage(config, {
      fetchImpl,
      logger,
      now: () => ticks.shift() ?? 13
    });

    await expect(
      storage.fetchText({
        cacheBust: false,
        path: PUBLIC_CATALOG_MANIFEST_PATH,
        requestId: "req_manifest_diag",
        timeoutMs: 1_000
      })
    ).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      statusCode: 503
    });

    expect(cancelled).toBe(true);
    expect(logger.log).toHaveBeenCalledWith({
      durationMs: 8,
      operation: "manifest_fetch",
      pathKind: "manifest",
      requestId: "req_manifest_diag",
      upstreamStatus: 403
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /service_role_value_must_not_leak|storage\/v1\/object|provider says/i
    );
  });

  it("does not let diagnostic logger failures replace storage provider errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const logger = {
      log: vi.fn(() => {
        throw new Error("logger failed with token=secret");
      })
    };
    const storage = createPublicCatalogSnapshotStorage(config, {
      fetchImpl,
      logger
    });

    await expect(
      storage.uploadJson({
        body: "{\"schemaVersion\":1}\n",
        path: buildPublicCatalogSnapshotPath(10),
        requestId: "req_logger_failed",
        timeoutMs: 1_000,
        upsert: false
      })
    ).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      message: "Public catalog storage is unavailable.",
      statusCode: 503
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});
