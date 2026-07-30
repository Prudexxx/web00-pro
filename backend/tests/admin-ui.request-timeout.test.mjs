import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_REQUEST_TIMEOUTS,
  createApiClient
} from "../src/admin/assets/api-client.js";
import { createAuthStore } from "../src/admin/assets/auth-store.js";
import { createTimedSignal } from "../src/admin/assets/request-timeout.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("admin request timeout infrastructure", () => {
  it("creates a fresh finite AbortSignal and cleans caller listeners", () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const addSpy = vi.spyOn(external.signal, "addEventListener");
    const removeSpy = vi.spyOn(external.signal, "removeEventListener");

    const timed = createTimedSignal({
      externalSignal: external.signal,
      timeoutMs: 25
    });
    const onAbort = vi.fn();
    timed.signal.addEventListener("abort", onAbort);

    expect(timed.signal).not.toBe(external.signal);
    expect(timed.signal.aborted).toBe(false);
    expect(timed.didTimeout()).toBe(false);

    vi.advanceTimersByTime(25);

    expect(timed.signal.aborted).toBe(true);
    expect(timed.didTimeout()).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);

    timed.cleanup();
    expect(removeSpy).toHaveBeenCalledWith("abort", addSpy.mock.calls[0][1]);
  });

  it("normalizes JSON GET, JSON mutation, and multipart timeouts", async () => {
    vi.useFakeTimers();
    const api = createApiClient({
      authStore: createAuthStore(),
      fetchImpl: abortableNeverFetch()
    });

    const get = settled(api.requestJson("/api/admin/sites", { method: "GET" }));
    await vi.advanceTimersByTimeAsync(ADMIN_REQUEST_TIMEOUTS.jsonGet);
    await expect(get).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: "Сервер не ответил вовремя.",
      status: 0
    });

    const mutation = settled(api.requestJson("/api/admin/sites", {
      body: { title: "WEB00" },
      method: "POST"
    }));
    await vi.advanceTimersByTimeAsync(ADMIN_REQUEST_TIMEOUTS.jsonMutation);
    await expect(mutation).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: "Сервер не ответил вовремя.",
      status: 0
    });

    const multipart = settled(api.requestMultipart(
      "/api/admin/sites/00000000-0000-4000-8000-000000000001/images/preview",
      {
        body: new FormData(),
        method: "PUT"
      }
    ));
    await vi.advanceTimersByTimeAsync(ADMIN_REQUEST_TIMEOUTS.multipart);
    await expect(multipart).resolves.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: "Сервер не ответил вовремя.",
      status: 0
    });
  });

  it("keeps explicit caller aborts separate from timeout/network failures", async () => {
    const controller = new AbortController();
    const api = createApiClient({
      authStore: createAuthStore(),
      fetchImpl: abortableNeverFetch()
    });

    const request = settled(api.requestJson("/api/admin/sites", {
      method: "GET",
      signal: controller.signal,
      timeoutMs: 60_000
    }));

    controller.abort();

    await expect(request).resolves.toMatchObject({
      code: "REQUEST_ABORTED",
      message: "Запрос отменён.",
      status: 0
    });
  });

  it("keeps real network failures distinct from abort-like errors", async () => {
    const api = createApiClient({
      authStore: createAuthStore(),
      fetchImpl: vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    });

    await expect(settled(api.requestJson("/api/admin/sites", { method: "GET" }))).resolves.toMatchObject({
      code: "NETWORK_ERROR",
      message: "Не удалось связаться с сервером.",
      status: 0
    });
  });
});

function abortableNeverFetch() {
  return vi.fn((_path, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener?.("abort", () => {
      reject(Object.assign(new Error("The operation was aborted."), {
        name: "AbortError"
      }));
    }, { once: true });
  }));
}

async function settled(promise) {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}
