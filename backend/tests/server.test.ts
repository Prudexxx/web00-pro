import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
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
