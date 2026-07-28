import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_STATES, createAuthStore } from "../src/admin/assets/auth-store.js";

const restoreGlobals = [];

afterEach(() => {
  while (restoreGlobals.length > 0) {
    restoreGlobals.pop()();
  }
});

describe("admin auth store", () => {
  it("starts bootstrapping and keeps the access token out of serialized snapshots", () => {
    const store = createAuthStore();
    const user = {
      email: "admin@example.test",
      id: "user-admin",
      role: "admin"
    };

    expect(store.getAccessToken()).toBeNull();
    expect(store.getSnapshot()).toEqual({
      state: AUTH_STATES.BOOTSTRAPPING,
      user: null
    });

    store.setAuthenticated({ accessToken: "memory-access-token", user });
    user.email = "mutated@example.test";
    const snapshot = store.getSnapshot();

    expect(store.getAccessToken()).toBe("memory-access-token");
    expect(snapshot).toEqual({
      state: AUTH_STATES.AUTHENTICATED,
      user: {
        email: "admin@example.test",
        id: "user-admin",
        role: "admin"
      }
    });
    expect(snapshot).not.toHaveProperty("accessToken");
    expect(JSON.stringify(snapshot)).not.toContain("memory-access-token");

    snapshot.user.email = "changed-after-read@example.test";
    expect(store.getSnapshot().user.email).toBe("admin@example.test");

    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getSnapshot()).toEqual({
      state: AUTH_STATES.UNAUTHENTICATED,
      user: null
    });
  });

  it("notifies active subscribers and shields state transitions from listener failures", () => {
    const store = createAuthStore();
    const failingListener = vi.fn(() => {
      throw new Error("subscriber failed");
    });
    const activeListener = vi.fn();
    const removedListener = vi.fn();

    store.subscribe(failingListener);
    store.subscribe(activeListener);
    const unsubscribe = store.subscribe(removedListener);
    unsubscribe();

    expect(() => store.setState(AUTH_STATES.REFRESHING)).not.toThrow();
    expect(() => store.setState(AUTH_STATES.LOGGING_OUT)).not.toThrow();

    expect(failingListener).toHaveBeenCalledTimes(2);
    expect(activeListener).toHaveBeenCalledTimes(2);
    expect(activeListener.mock.calls.map(([snapshot]) => snapshot.state)).toEqual([
      AUTH_STATES.REFRESHING,
      AUTH_STATES.LOGGING_OUT
    ]);
    expect(removedListener).not.toHaveBeenCalled();
  });

  it("does not touch browser persistence APIs or document cookies", () => {
    for (const key of ["localStorage", "sessionStorage", "indexedDB", "caches", "document"]) {
      installReadTrap(key);
    }

    const store = createAuthStore();
    store.setAuthenticated({
      accessToken: "closure-only-token",
      user: {
        email: "editor@example.test",
        id: "user-editor",
        role: "editor"
      }
    });
    store.clear();

    expect(store.getAccessToken()).toBeNull();
    expect(store.getSnapshot().user).toBeNull();
  });

  it("keeps forbidden persistence strings out of production auth store source", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src", "admin", "assets", "auth-store.js"),
      "utf8"
    );

    expect(source).not.toMatch(
      /localStorage|sessionStorage|indexedDB|caches|document\.cookie/
    );
  });
});

function installReadTrap(key) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);

  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() {
      throw new Error(`${key} must not be read by the auth store`);
    }
  });

  restoreGlobals.push(() => {
    if (descriptor === undefined) {
      delete globalThis[key];
      return;
    }

    Object.defineProperty(globalThis, key, descriptor);
  });
}
