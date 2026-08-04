import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import { createShutdownHandler } from "../src/server.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

describe("createShutdownHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the server once and schedules a 10 second forced timeout", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const exit = vi.fn();
    const logger = { log: vi.fn() };
    const handler = createShutdownHandler(
      { close } as unknown as Server,
      { env: testEnv, exit, logger, signal: "SIGTERM" }
    );

    handler();
    handler();

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("clears the forced timeout after a successful close", async () => {
    vi.useFakeTimers();
    let closeCallback: (() => void) | undefined;
    const close = vi.fn((callback?: () => void) => {
      closeCallback = callback;
      return undefined as unknown as Server;
    });
    const exit = vi.fn();
    const logger = { log: vi.fn() };
    const handler = createShutdownHandler(
      { close } as unknown as Server,
      { env: testEnv, exit, logger, signal: "SIGINT" }
    );

    handler();
    closeCallback?.();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disconnects Prisma exactly once during graceful shutdown", async () => {
    vi.useFakeTimers();
    let closeCallback: (() => void) | undefined;
    const close = vi.fn((callback?: () => void) => {
      closeCallback = callback;
      return undefined as unknown as Server;
    });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const logger = { log: vi.fn() };
    const handler = createShutdownHandler(
      { close } as unknown as Server,
      { disconnect, env: testEnv, exit, logger, signal: "SIGTERM" }
    );

    handler();
    handler();
    closeCallback?.();
    await vi.runOnlyPendingTimersAsync();

    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it("keeps the forced timeout armed until async disconnect completes", async () => {
    vi.useFakeTimers();
    let closeCallback: (() => void) | undefined;
    const close = vi.fn((callback?: () => void) => {
      closeCallback = callback;
      return undefined as unknown as Server;
    });
    const disconnect = vi.fn(() => new Promise<void>(() => undefined));
    const exit = vi.fn();
    const logger = { log: vi.fn() };
    const handler = createShutdownHandler(
      { close } as unknown as Server,
      { disconnect, env: testEnv, exit, logger, signal: "SIGTERM" }
    );

    handler();
    closeCallback?.();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("app/server auth integration boundary", () => {
  it("binds the HTTP listener to all interfaces for Render while preserving lifecycle logging", async () => {
    vi.resetModules();
    const listen = vi.fn();
    const close = vi.fn();
    const server = { close, listen } as unknown as Server;

    vi.doMock("node:http", () => ({
      createServer: vi.fn(() => server)
    }));

    const { startServer } = await import("../src/server.js");
    const logger = { log: vi.fn() };
    const port = 53_201;

    startServer({
      authEnv: {
        ACCESS_TOKEN_TTL_SECONDS: 900,
        AUTH_FINGERPRINT_SECRET: Buffer.alloc(32, 2),
        AUTH_FINGERPRINT_SECRET_BASE64: Buffer.alloc(32, 2).toString("base64"),
        JWT_ACCESS_SECRET: Buffer.alloc(32, 1),
        JWT_ACCESS_SECRET_BASE64: Buffer.alloc(32, 1).toString("base64"),
        JWT_AUDIENCE: "web00-admin",
        JWT_ISSUER: "web00-backend",
        REFRESH_TOKEN_TTL_SECONDS: 604_800,
        TRUST_PROXY_HOPS: 1
      },
      createPrisma: vi.fn(() => ({ $disconnect: vi.fn() }) as never),
      databaseEnv: { DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/web00_backend_dev" },
      env: { ...testEnv, PORT: port },
      logger,
      publicCorsConfig: {
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        allowedOrigins: new Set(["https://prudexxx.github.io"]),
        maxOrigins: 10
      },
      registerSignalHandlers: false,
      storageConfig: {
        bucket: "web00-catalog-images",
        credentials: {
          serviceRoleKey: "sb_secret_fake",
          supabaseUrl: "https://qcizrrqkvdgpcgvnnfpb.supabase.co"
        },
        publicBaseUrl: "https://qcizrrqkvdgpcgvnnfpb.supabase.co",
        workerEnabled: false,
        workerPollIntervalSeconds: 60
      }
    });

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(port, "0.0.0.0", expect.any(Function));

    const lifecycleCallback = listen.mock.calls[0]?.[2] as (() => void) | undefined;
    lifecycleCallback?.();

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "server_started",
        service: "web00-backend"
      })
    );

    vi.doUnmock("node:http");
  });

  it("stops the V2 runtime concurrently with cleanup before disconnecting Prisma during shutdown", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    let closeCallback: ((error?: Error) => void) | undefined;
    const listen = vi.fn();
    const close = vi.fn((callback?: (error?: Error) => void) => {
      closeCallback = callback;
      return undefined as unknown as Server;
    });
    const server = { close, listen } as unknown as Server;
    const cleanupStopGate = createDeferred<void>();
    const order: string[] = [];
    const runtimeStop = vi.fn(async () => {
      order.push("runtime.stop");
    });
    const cleanupStop = vi.fn(async () => {
      order.push("cleanup.stop.begin");
      await cleanupStopGate.promise;
      order.push("cleanup.stop.end");
    });
    const disconnect = vi.fn(async () => {
      order.push("prisma.disconnect");
    });
    const signalHandlers: Partial<Record<NodeJS.Signals, () => void>> = {};
    const processOnce = vi.spyOn(process, "once").mockImplementation(((signal, listener) => {
      if (signal === "SIGTERM" || signal === "SIGINT") {
        signalHandlers[signal] = listener as () => void;
      }

      return process;
    }) as typeof process.once);

    vi.doMock("node:http", () => ({
      createServer: vi.fn(() => server)
    }));
    vi.doMock("../src/modules/storage-cleanup/storage-cleanup.worker.js", () => ({
      createStorageCleanupWorker: vi.fn(() => ({
        start: vi.fn(),
        stop: cleanupStop,
        tick: vi.fn()
      }))
    }));
    vi.doMock("../src/modules/public-catalog-v2/public-catalog-v2.runtime.js", () => ({
      createPublicCatalogV2Runtime: vi.fn(() => ({
        reconcileOnce: vi.fn(),
        runOnce: vi.fn(),
        start: vi.fn(),
        stop: runtimeStop
      }))
    }));

    try {
      const { startServer } = await import("../src/server.js");

      startServer({
        authEnv: {
          ACCESS_TOKEN_TTL_SECONDS: 900,
          AUTH_FINGERPRINT_SECRET: Buffer.alloc(32, 2),
          AUTH_FINGERPRINT_SECRET_BASE64: Buffer.alloc(32, 2).toString("base64"),
          JWT_ACCESS_SECRET: Buffer.alloc(32, 1),
          JWT_ACCESS_SECRET_BASE64: Buffer.alloc(32, 1).toString("base64"),
          JWT_AUDIENCE: "web00-admin",
          JWT_ISSUER: "web00-backend",
          REFRESH_TOKEN_TTL_SECONDS: 604_800,
          TRUST_PROXY_HOPS: 1
        },
        createPrisma: vi.fn(() => ({ $disconnect: disconnect }) as never),
        databaseEnv: { DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/web00_backend_dev" },
        env: { ...testEnv, PORT: 53_202 },
        logger: { log: vi.fn() },
        publicCatalogV2WorkerEnabled: true,
        publicCorsConfig: {
          allowedMethods: ["GET", "HEAD", "OPTIONS"],
          allowedOrigins: new Set(["https://prudexxx.github.io"]),
          maxOrigins: 10
        },
        storageConfig: {
          bucket: "web00-catalog-images",
          credentials: {
            serviceRoleKey: "sb_secret_fake",
            supabaseUrl: "https://storage.web00.invalid"
          },
          publicBaseUrl: "https://storage.web00.invalid",
          workerEnabled: true,
          workerPollIntervalSeconds: 60
        }
      });

      signalHandlers.SIGTERM?.();
      closeCallback?.();
      await Promise.resolve();

      expect(runtimeStop).toHaveBeenCalledTimes(1);
      expect(cleanupStop).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();

      cleanupStopGate.resolve();
      await vi.runOnlyPendingTimersAsync();

      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(order).toEqual([
        "runtime.stop",
        "cleanup.stop.begin",
        "cleanup.stop.end",
        "prisma.disconnect"
      ]);
    } finally {
      processOnce.mockRestore();
      vi.doUnmock("node:http");
      vi.doUnmock("../src/modules/storage-cleanup/storage-cleanup.worker.js");
      vi.doUnmock("../src/modules/public-catalog-v2/public-catalog-v2.runtime.js");
    }
  });

  it("mounts injected auth routes before the final 404 handler", async () => {
    const authRoutes = express.Router();

    authRoutes.get("/test", (_request, response) => {
      response.json({ data: "auth" });
    });

    const app = createApp({ authRoutes, env: testEnv });

    await request(app).get("/api/auth/test").expect(200);
  });

  it("keeps app.ts free from process.env reads", () => {
    const source = readFileSync(join(process.cwd(), "src", "app.ts"), "utf8");

    expect(source).not.toContain("process.env");
  });

  it("parses only runtime database env during server startup", () => {
    const source = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");

    expect(source).toContain("parseRuntimeDatabaseEnv");
    expect(source).not.toContain("parseDatabaseEnv");
    expect(source).not.toContain("TEST_DATABASE_URL");
    expect(source).not.toContain("SHADOW_DATABASE_URL");
  });

  it("passes parsed NODE_ENV into auth environment parsing", () => {
    const source = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");

    expect(source).toContain("parseAuthEnv(process.env, { nodeEnv: env.NODE_ENV })");
  });

  it("wires bounded image processing config from safe env into the Sharp processor", () => {
    const source = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");

    expect(source).toContain("parseImageProcessingEnv(process.env)");
    expect(source).toContain("toImageProcessingConfig");
    expect(source).toContain("imageProcessingConfig.timeoutMs");
    expect(source).toContain("imageProcessingConfig.maxConcurrency");
  });

  it("wires public CORS and readiness through app/server composition", () => {
    const appSource = readFileSync(join(process.cwd(), "src", "app.ts"), "utf8");
    const serverSource = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");

    expect(appSource).toContain("publicCorsConfig");
    expect(appSource).toContain("readinessService");
    expect(appSource).toContain("createReadinessRouter");
    expect(serverSource).toContain("parsePublicCorsEnv");
    expect(serverSource).toContain("toPublicCorsConfig");
    expect(serverSource).toContain("createReadinessService");
    expect(serverSource).toContain("createPrismaReadinessProbe");
  });

  it("wires public catalog bucket self-healing only into sync composition", () => {
    const serverSource = readFileSync(join(process.cwd(), "src", "server.ts"), "utf8");
    const syncBlock =
      serverSource.match(
        /const publicCatalogSyncService = createPublicCatalogSyncService\(\{[\s\S]*?\n  \}\);/
      )?.[0] ?? "";
    const dryRunBlock =
      serverSource.match(
        /const publicCatalogDryRunService = createPublicCatalogDryRunService\(\{[\s\S]*?\n  \}\);/
      )?.[0] ?? "";

    expect(serverSource).toContain("createPublicCatalogStorageBucketManager");
    expect(serverSource).toContain("const publicCatalogStorageBucket");
    expect(syncBlock).toContain("bucketManager: publicCatalogStorageBucket");
    expect(syncBlock).not.toContain("imageUrlPolicy");
    expect(serverSource).not.toContain(".ensureReady(");
    expect(dryRunBlock).not.toContain("storage");
    expect(dryRunBlock).not.toContain("Bucket");
  });

  it("uses numeric trust proxy hops and never boolean true", () => {
    const app = createApp({ env: testEnv, trustProxyHops: 2 });

    expect(app.get("trust proxy")).toBe(2);
    expect(app.get("trust proxy")).not.toBe(true);
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}
