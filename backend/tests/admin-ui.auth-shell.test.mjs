import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_STATES } from "../src/admin/assets/auth-store.js";
import { bootstrapAdminApp, waitForAdminBackendReady } from "../src/admin/assets/main.js";
import { createLoginView } from "../src/admin/assets/screens/login.js";
import { createAuthenticatedShell } from "../src/admin/assets/screens/shell.js";

const restoreGlobals = [];

afterEach(() => {
  vi.useRealTimers();
  while (restoreGlobals.length > 0) {
    restoreGlobals.pop()();
  }
});

describe("admin auth shell", () => {
  it("bootstraps with refresh then me and renders the authenticated shell", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath, options) => {
      if (requestPath === "/api/auth/refresh") {
        expect(options.method).toBe("POST");
        expect(options.credentials).toBe("same-origin");
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "bootstrap-token",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        expect(readHeader(options, "Authorization")).toBe("Bearer bootstrap-token");
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("admin")
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    const app = await bootstrapAdminApp({ documentRef, fetchImpl, root });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/me"
    ]);
    expect(app.authStore.getSnapshot()).toEqual({
      state: AUTH_STATES.AUTHENTICATED,
      user: safeUser("admin")
    });
    expect(root.textContent).toContain("admin@example.test");
    expect(root.textContent).toContain("Администратор");
  });

  it("shows the login view when refresh bootstrap fails", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, {
      error: {
        code: "REFRESH_REQUIRED",
        message: "Refresh token is required.",
        requestId: "req_refresh_required"
      }
    }));

    const app = await bootstrapAdminApp({ documentRef, fetchImpl, root });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh"]);
    expect(app.authStore.getAccessToken()).toBeNull();
    expect(root.textContent).toContain("Вход");
    expect(root.textContent).toContain("Эл. почта");
    expect(root.textContent).toContain("Пароль");
    expect(root.textContent).not.toMatch(/регистрац|восстанов|register|reset/i);
  });

  it("checks backend readiness before auth bootstrap and before showing the authenticated shell when enabled", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "ready-token",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("admin")
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      root
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/ready",
      "/api/auth/refresh",
      "/api/auth/me"
    ]);
    expect(readHeader(fetchImpl.mock.calls[0][1], "Authorization")).toBeUndefined();
    expect(root.textContent).toContain("admin@example.test");
  });

  it("shows a cold-start readiness message while waiting for the backend", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const ready = createDeferred();
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return ready.promise;
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "ready-token",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("admin")
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    const boot = bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      root
    });
    await waitFor(() => root.textContent.includes("Backend просыпается, подождите..."));

    ready.resolve(jsonResponse(200, { status: "ready" }));
    await boot;
    expect(root.textContent).toContain("admin@example.test");
  });

  it("shows a backend unavailable retry screen instead of silently redirecting to login", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(503, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Backend unavailable.",
            requestId: "req_ready_timeout"
          }
        }));
      }

      throw new Error(`Auth must not start before readiness, got ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      readinessRetryMs: 0,
      readinessTimeoutMs: 1,
      root
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["/api/ready"]);
    expect(root.textContent).toContain("Backend пока недоступен");
    expect(root.textContent).toContain("Введённые данные не потеряны");
    expect(root.textContent).not.toContain("Вход");

    root.querySelector('[data-action="retry-readiness"]').dispatchEvent(createFakeEvent("click"));
    await flushPromises();

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/ready")).toHaveLength(2);
  });

  it("keeps the readiness total budget strict and does not start a new attempt at zero remaining time", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    const timeline = [
      1_000,
      1_000,
      1_000,
      1_030,
      1_030,
      1_030,
      1_031
    ];
    nowSpy.mockImplementation(() => timeline.shift() ?? 1_031);
    const api = {
      requestJson: vi.fn((_path, options = {}) => {
        expect(options.timeoutMs).toBeGreaterThan(0);
        return Promise.reject({
          code: "REQUEST_TIMEOUT",
          message: "Сервер не ответил вовремя.",
          status: 0
        });
      })
    };

    await expect(waitForAdminBackendReady(api, {
      readinessAttemptTimeoutMs: 100,
      readinessRetryMs: 0,
      readinessTimeoutMs: 30
    })).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT"
    });

    expect(api.requestJson).toHaveBeenCalledTimes(1);
    expect(api.requestJson.mock.calls[0][1].timeoutMs).toBeLessThanOrEqual(30);

    nowSpy.mockRestore();
  });

  it("shows login after readiness when bootstrap has no active authenticated session", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(401, {
          error: {
            code: "REFRESH_REQUIRED",
            message: "Refresh token is required.",
            requestId: "req_no_session"
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      root
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/ready",
      "/api/auth/refresh"
    ]);
    expect(root.textContent).toContain("Вход");
    expect(root.textContent).not.toContain("Backend пока недоступен");
  });

  it("keeps bootstrap network failures on the backend unavailable screen instead of showing login", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      root
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/ready",
      "/api/auth/refresh"
    ]);
    expect(root.textContent).toContain("Backend пока недоступен");
    expect(root.textContent).toContain("Введённые данные не потеряны");
    expect(root.textContent).not.toContain("Вход");
  });

  it("shows a controlled diagnostic screen for unknown bootstrap server failures", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(500, {
          error: {
            code: "INTERNAL_ERROR",
            message: "Prisma stack trace must not be shown.",
            requestId: "req_bootstrap_500"
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      root
    });

    expect(root.textContent).toContain("Панель временно недоступна");
    expect(root.textContent).toContain("Передайте requestId разработчику.");
    expect(root.textContent).toContain("req_bootstrap_500");
    expect(root.textContent).toContain("Скопировать requestId");
    expect(root.textContent).not.toContain("Prisma stack trace");
    expect(root.textContent).not.toContain("Вход");
  });

  it("runs a readiness preflight before login when readiness is stale", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(401, {
          error: {
            code: "REFRESH_REQUIRED",
            message: "Refresh token is required.",
            requestId: "req_refresh_required"
          }
        }));
      }
      if (requestPath === "/api/auth/login") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "login-ready-token",
            user: safeUser("editor")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("editor")
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: false,
      enableReadinessCheck: true,
      fetchImpl,
      readinessFreshMs: 0,
      root
    });

    setValue(root, "email", "editor@example.test");
    setValue(root, "password", "correct-password");
    root.querySelector("form").dispatchEvent(createFakeEvent("submit"));
    await waitFor(() => fetchImpl.mock.calls.some(([url]) => url === "/api/auth/me"));

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/ready",
      "/api/auth/refresh",
      "/api/ready",
      "/api/auth/login",
      "/api/auth/me"
    ]);
  });

  it("stops visible-tab keep-warm readiness pings after logout", async () => {
    vi.useFakeTimers();
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "keepwarm-token",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/ready") {
        return Promise.resolve(jsonResponse(200, { status: "ready" }));
      }
      if (requestPath === "/api/auth/logout") {
        return Promise.resolve(jsonResponse(204, null));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({
      autoLoadScreens: false,
      documentRef,
      enableKeepWarm: true,
      enableReadinessCheck: false,
      fetchImpl,
      keepWarmIntervalMs: 10,
      root
    });

    vi.advanceTimersByTime(10);
    await flushPromises();
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/ready")).toHaveLength(1);

    root.querySelector('[data-action="logout"]').dispatchEvent(createFakeEvent("click"));
    await flushPromises();
    vi.advanceTimersByTime(30);
    await flushPromises();

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/ready")).toHaveLength(1);
  });

  it("submits login credentials, clears the password field, calls me, and stores token only in memory", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const localStorage = installStorageTrap("localStorage");
    const sessionStorage = installStorageTrap("sessionStorage");
    const consoleLog = installConsoleTrap("log");
    const consoleWarn = installConsoleTrap("warn");
    const consoleError = installConsoleTrap("error");
    const fetchImpl = vi.fn((requestPath, options) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(401, {
          error: {
            code: "REFRESH_REQUIRED",
            message: "Refresh token is required.",
            requestId: "req_refresh_required"
          }
        }));
      }
      if (requestPath === "/api/auth/login") {
        expect(options.method).toBe("POST");
        expect(options.credentials).toBe("same-origin");
        expect(JSON.parse(options.body)).toEqual({
          email: "editor@example.test",
          password: "secret-password"
        });
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "login-token",
            user: safeUser("editor")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        expect(readHeader(options, "Authorization")).toBe("Bearer login-token");
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("editor")
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    const app = await bootstrapAdminApp({ documentRef, fetchImpl, root });
    const emailInput = root.querySelector("[name=email]");
    const passwordInput = root.querySelector("[name=password]");

    emailInput.value = "editor@example.test";
    passwordInput.value = "secret-password";
    root.querySelector("form").dispatchEvent(createFakeEvent("submit"));
    expect(passwordInput.value).toBe("");
    await waitFor(() => fetchImpl.mock.calls.some(([url]) => url === "/api/auth/me"));

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/login",
      "/api/auth/me"
    ]);
    expect(app.authStore.getAccessToken()).toBe("login-token");
    expect(JSON.stringify(app.authStore.getSnapshot())).not.toContain("login-token");
    expect(JSON.stringify(app.authStore.getSnapshot())).not.toContain("secret-password");
    expect(countStorageCalls(localStorage)).toBe(0);
    expect(countStorageCalls(sessionStorage)).toBe(0);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(root.textContent).toContain("editor@example.test");
    expect(root.textContent).not.toContain("secret-password");
  });

  it("keeps login values after a network failure and does not show a wrong-password error", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(401, {
          error: {
            code: "REFRESH_REQUIRED",
            message: "Refresh token is required.",
            requestId: "req_refresh_required"
          }
        }));
      }
      if (requestPath === "/api/auth/login") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    await bootstrapAdminApp({ documentRef, fetchImpl, root });
    const emailInput = root.querySelector("[name=email]");
    const passwordInput = root.querySelector("[name=password]");

    emailInput.value = "editor@example.test";
    passwordInput.value = "still-needed-password";
    root.querySelector("form").dispatchEvent(createFakeEvent("submit"));
    await waitFor(() => root.textContent.includes("Не удалось связаться с сервером."));

    expect(emailInput.value).toBe("editor@example.test");
    expect(passwordInput.value).toBe("still-needed-password");
    expect(root.textContent).not.toContain("Почта или пароль указаны неверно.");
  });

  it("keeps editor navigation away from admin-only and mutation actions", () => {
    const documentRef = createFakeDocument();
    const shell = createAuthenticatedShell({
      documentRef,
      onLogout: vi.fn(),
      onNavigate: vi.fn(),
      user: safeUser("editor")
    });

    expect(shell.textContent).toContain("Сайты");
    expect(shell.textContent).toContain("Категории");
    expect(shell.textContent).toContain("Выйти");
    expect(shell.textContent).not.toContain("Пользователи");
    expect(shell.textContent).not.toContain("Журнал");
    expect(shell.textContent).not.toContain("Создать категорию");
  });

  it("shows all approved navigation sections for admins", () => {
    const documentRef = createFakeDocument();
    const shell = createAuthenticatedShell({
      documentRef,
      onLogout: vi.fn(),
      onNavigate: vi.fn(),
      user: safeUser("admin")
    });

    expect(sectionLabels(shell)).toEqual([
      "Сайты",
      "Категории",
      "Пользователи",
      "Журнал"
    ]);
    expect(shell.querySelector('[data-section="sites"]').getAttribute("aria-current")).toBe("page");
  });

  it("clears memory immediately on logout and returns to login even when logout fails", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    let rejectLogout;
    const logoutPromise = new Promise((_resolve, reject) => {
      rejectLogout = reject;
    });
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "logout-token",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/logout") {
        return logoutPromise;
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });

    const app = await bootstrapAdminApp({ documentRef, fetchImpl, root });
    const logoutButton = root.querySelector('[data-action="logout"]');

    expect(app.authStore.getAccessToken()).toBe("logout-token");
    logoutButton.dispatchEvent(createFakeEvent("click"));

    expect(app.authStore.getAccessToken()).toBeNull();
    expect(app.authStore.getSnapshot()).toEqual({
      state: AUTH_STATES.UNAUTHENTICATED,
      user: null
    });
    expect(root.textContent).toContain("Вход");

    rejectLogout(new Error("network failed"));
    await flushPromises();

    expect(root.textContent).toContain("Вход");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/me",
      "/api/auth/logout"
    ]);
  });

  it("creates a semantic Russian login view without registration or reset-password controls", () => {
    const documentRef = createFakeDocument();
    const login = createLoginView({
      documentRef,
      onSubmit: vi.fn()
    });

    expect(login.querySelector("form")).not.toBeNull();
    expect(login.querySelector("[name=email]").type).toBe("email");
    expect(login.querySelector("[name=email]").autocomplete).toBe("email");
    expect(login.querySelector("[name=password]").type).toBe("password");
    expect(login.querySelector("[name=password]").autocomplete).toBe("current-password");
    expect(login.querySelector("[aria-live=polite]")).not.toBeNull();
    expect(login.textContent).toContain("Вход");
    expect(login.textContent).toContain("Войти");
    expect(login.textContent).not.toMatch(/registration|reset password|sign up/i);
  });
});

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createTextNode(text) {
      return new FakeTextNode(text);
    }
  };
}

class FakeTextNode {
  constructor(text) {
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName) {
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.disabled = false;
    this.listeners = new Map();
    this.parentNode = null;
    this.tagName = tagName.toLowerCase();
    this.value = "";
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === "string" ? new FakeTextNode(node) : node;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  focus() {
    this.focused = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];

    walk(this, (node) => {
      if (node instanceof FakeElement && node.matches(selector)) {
        matches.push(node);
      }
    });

    return matches;
  }

  matches(selector) {
    if (selector.startsWith("[")) {
      const match = /^\[([^=\]]+)=?"?([^\]"]*)"?\]$/.exec(selector);
      if (match === null) {
        return false;
      }

      const [, name, value] = match;
      if (value === "") {
        return this.attributes.has(name);
      }

      return this.getAttribute(name) === value;
    }

    return this.tagName === selector.toLowerCase();
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    const textValue = String(value);

    this.attributes.set(name, textValue);
    if (name === "autocomplete") {
      this.autocomplete = textValue;
    }
    if (name === "class") {
      this.className = textValue;
    }
    if (name === "name") {
      this.name = textValue;
    }
    if (name === "type") {
      this.type = textValue;
    }
  }

  get textContent() {
    return [
      this.ownTextContent ?? "",
      ...this.children.map((child) => child.textContent)
    ].join("");
  }

  set textContent(value) {
    this.ownTextContent = String(value);
    this.children = [];
  }
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

function createFakeEvent(type) {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: null,
    type
  };
}

function setValue(root, name, value) {
  const input = root.querySelector(`[name="${name}"]`);

  input.value = value;
  input.dispatchEvent(createFakeEvent("input"));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error("Timed out waiting for async admin UI work.");
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

function readHeader(options, name) {
  const headers = options.headers;

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  return headers?.[name] ?? headers?.[name.toLowerCase()];
}

function installStorageTrap(name) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  const storage = {
    clear: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  };

  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage
  });

  restoreGlobals.push(() => {
    if (descriptor === undefined) {
      delete globalThis[name];
      return;
    }

    Object.defineProperty(globalThis, name, descriptor);
  });

  return storage;
}

function installConsoleTrap(method) {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  restoreGlobals.push(() => {
    spy.mockRestore();
  });
  return spy;
}

function countStorageCalls(storage) {
  return [
    storage.clear,
    storage.getItem,
    storage.removeItem,
    storage.setItem
  ].reduce((total, method) => total + method.mock.calls.length, 0);
}

function safeUser(role) {
  return {
    email: `${role}@example.test`,
    id: `user-${role}`,
    role
  };
}

function sectionLabels(shell) {
  return shell.querySelectorAll("[data-section]").map((item) => item.textContent);
}
