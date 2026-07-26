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
});

describe("app/server auth integration boundary", () => {
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

  it("uses numeric trust proxy hops and never boolean true", () => {
    const app = createApp({ env: testEnv, trustProxyHops: 2 });

    expect(app.get("trust proxy")).toBe(2);
    expect(app.get("trust proxy")).not.toBe(true);
  });
});
