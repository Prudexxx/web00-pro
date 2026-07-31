import { describe, expect, it, vi } from "vitest";

import {
  parseApiError,
  createApiClient
} from "../src/admin/assets/api-client.js";
import { AUTH_STATES, createAuthStore } from "../src/admin/assets/auth-store.js";

describe("admin API client", () => {
  it("accepts only same-origin API paths and rejects absolute or traversal-like input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }));
    const api = createApiClient({ authStore: createAuthStore(), fetchImpl });

    await expect(api.requestJson("/api/admin/sites", { method: "GET" })).resolves.toEqual({
      data: []
    });

    for (const path of [
      "https://admin.example.test/api/admin/sites",
      "//admin.example.test/api/admin/sites",
      "/admin/assets/main.js",
      "/api/admin/../auth/me",
      "/api/%2e%2e/auth/me"
    ]) {
      await expect(api.requestJson(path, { method: "GET" })).rejects.toMatchObject({
        code: "INVALID_API_PATH"
      });
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("injects Bearer auth and sets JSON content type only for JSON request bodies", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "site-1" } }));
    const api = createApiClient({ authStore, fetchImpl });
    const signal = new AbortController().signal;

    authStore.setAuthenticated({
      accessToken: "memory-token-a",
      user: {
        email: "admin@example.test",
        id: "user-admin",
        role: "admin"
      }
    });

    await api.requestJson("/api/admin/sites", { method: "GET", signal });
    await api.requestJson("/api/admin/sites", {
      body: { title: "WEB00" },
      method: "POST"
    });

    const getOptions = fetchImpl.mock.calls[0][1];
    const postOptions = fetchImpl.mock.calls[1][1];

    expect(readHeader(getOptions, "Authorization")).toBe("Bearer memory-token-a");
    expect(readHeader(getOptions, "Accept")).toBe("application/json");
    expect(readHeader(getOptions, "Content-Type")).toBeUndefined();
    expect(getOptions.signal).not.toBe(signal);
    expect(getOptions.signal.aborted).toBe(false);

    expect(readHeader(postOptions, "Authorization")).toBe("Bearer memory-token-a");
    expect(readHeader(postOptions, "Content-Type")).toBe("application/json");
    expect(postOptions.body).toBe(JSON.stringify({ title: "WEB00" }));
  });

  it("uses one shared refresh and replays simultaneous JSON requests once", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi.fn((requestPath) => {
      const adminAttempt = fetchImpl.mock.calls.filter(([url]) => url === requestPath).length;

      if (requestPath === "/api/admin/sites" && adminAttempt === 1) {
        return Promise.resolve(authExpiredResponse("req_sites"));
      }
      if (requestPath === "/api/admin/categories" && adminAttempt === 1) {
        return Promise.resolve(authExpiredResponse("req_categories"));
      }
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "memory-token-b",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/admin/sites") {
        return Promise.resolve(jsonResponse(200, { data: [{ id: "site-1" }] }));
      }
      if (requestPath === "/api/admin/categories") {
        return Promise.resolve(jsonResponse(200, { data: [{ id: "category-1" }] }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });
    const api = createApiClient({ authStore, fetchImpl });

    authStore.setAuthenticated({
      accessToken: "memory-token-old",
      user: safeUser("admin")
    });

    const [sites, categories] = await Promise.all([
      api.requestJson("/api/admin/sites", { method: "GET" }),
      api.requestJson("/api/admin/categories", { method: "GET" })
    ]);

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/admin/sites")).toHaveLength(2);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/admin/categories")).toHaveLength(2);
    expect(sites).toEqual({ data: [{ id: "site-1" }] });
    expect(categories).toEqual({ data: [{ id: "category-1" }] });
    expect(authStore.getAccessToken()).toBe("memory-token-b");
  });

  it("preserves X-Request-Id when expired auth refreshes and replays a JSON mutation", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authExpiredResponse("req_expired_create"))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: "memory-token-create-new",
          user: safeUser("admin")
        }
      }))
      .mockResolvedValueOnce(jsonResponse(201, {
        data: {
          id: "site-created"
        }
      }));
    const api = createApiClient({ authStore, fetchImpl });

    authStore.setAuthenticated({
      accessToken: "memory-token-create-old",
      user: safeUser("admin")
    });

    await expect(api.requestJson("/api/admin/sites", {
      body: { title: "Create draft" },
      headers: {
        "X-Request-Id": "req_create_stable"
      },
      method: "POST"
    })).resolves.toEqual({
      data: {
        id: "site-created"
      }
    });

    const createCalls = fetchImpl.mock.calls.filter(([url]) => url === "/api/admin/sites");

    expect(createCalls).toHaveLength(2);
    expect(readHeader(createCalls[0][1], "X-Request-Id")).toBe("req_create_stable");
    expect(readHeader(createCalls[1][1], "X-Request-Id")).toBe("req_create_stable");
    expect(readHeader(createCalls[0][1], "Authorization")).toBe("Bearer memory-token-create-old");
    expect(readHeader(createCalls[1][1], "Authorization")).toBe("Bearer memory-token-create-new");
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("limits JSON replay to one retry and does not refresh FORBIDDEN responses", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authExpiredResponse("req_first"))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: "memory-token-c",
          user: safeUser("admin")
        }
      }))
      .mockResolvedValueOnce(authExpiredResponse("req_second"))
      .mockResolvedValueOnce(jsonResponse(403, {
        error: {
          code: "FORBIDDEN",
          message: "Forbidden.",
          requestId: "req_forbidden"
        }
      }));
    const api = createApiClient({ authStore, fetchImpl });

    authStore.setAuthenticated({
      accessToken: "memory-token-old",
      user: safeUser("admin")
    });

    await expect(api.requestJson("/api/admin/sites", { method: "GET" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "req_second"
    });
    await expect(api.requestJson("/api/admin/sites", { method: "GET" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      requestId: "req_forbidden"
    });

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/admin/sites")).toHaveLength(3);
  });

  it("refreshes auth once and replays multipart requests without changing the FormData body", async () => {
    const authStore = createAuthStore();
    const formData = new FormData();
    const signal = new AbortController().signal;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authExpiredResponse("req_upload_expired"))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: "memory-token-upload-new",
          user: safeUser("admin")
        }
      }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { uploaded: true } }));
    const api = createApiClient({ authStore, fetchImpl });

    formData.append("clientFileId", "00000000-0000-4000-8000-000000000001");
    authStore.setAuthenticated({
      accessToken: "memory-token-upload",
      user: safeUser("admin")
    });

    await expect(
      api.requestMultipart("/api/admin/sites/00000000-0000-4000-8000-000000000002/images/preview", {
        body: formData,
        method: "PUT",
        signal
      })
    ).resolves.toEqual({ data: { uploaded: true } });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/sites/00000000-0000-4000-8000-000000000002/images/preview",
      "/api/auth/refresh",
      "/api/admin/sites/00000000-0000-4000-8000-000000000002/images/preview"
    ]);
    expect(readHeader(fetchImpl.mock.calls[0][1], "Authorization")).toBe(
      "Bearer memory-token-upload"
    );
    expect(readHeader(fetchImpl.mock.calls[2][1], "Authorization")).toBe(
      "Bearer memory-token-upload-new"
    );
    expect(readHeader(fetchImpl.mock.calls[0][1], "Content-Type")).toBeUndefined();
    expect(readHeader(fetchImpl.mock.calls[2][1], "Content-Type")).toBeUndefined();
    expect(fetchImpl.mock.calls[0][1].body).toBe(formData);
    expect(fetchImpl.mock.calls[2][1].body).toBe(formData);
    expect(fetchImpl.mock.calls[0][1].method).toBe("PUT");
    expect(fetchImpl.mock.calls[2][1].method).toBe("PUT");
    expect(fetchImpl.mock.calls[0][1].signal).not.toBe(signal);
    expect(fetchImpl.mock.calls[2][1].signal).not.toBe(signal);
    expect(fetchImpl.mock.calls[0][1].signal).not.toBe(fetchImpl.mock.calls[2][1].signal);
    expect(authStore.getAccessToken()).toBe("memory-token-upload-new");
  });

  it("does not loop when a replayed multipart request is still unauthorized", async () => {
    const authStore = createAuthStore();
    const formData = new FormData();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authExpiredResponse("req_upload_first"))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: "memory-token-upload-new",
          user: safeUser("admin")
        }
      }))
      .mockResolvedValueOnce(authExpiredResponse("req_upload_second"));
    const api = createApiClient({ authStore, fetchImpl });

    formData.append("clientFileId", "00000000-0000-4000-8000-000000000001");
    authStore.setAuthenticated({
      accessToken: "memory-token-upload-old",
      user: safeUser("admin")
    });

    await expect(
      api.requestMultipart("/api/admin/sites/00000000-0000-4000-8000-000000000002/images/gallery", {
        body: formData
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "req_upload_second"
    });

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes("/images/gallery"))).toHaveLength(2);
  });

  it("does not refresh or attach Authorization for auth-disabled multipart requests", async () => {
    const authStore = createAuthStore();
    const formData = new FormData();
    const fetchImpl = vi.fn().mockResolvedValue(authExpiredResponse("req_upload_public"));
    const api = createApiClient({ authStore, fetchImpl });

    authStore.setAuthenticated({
      accessToken: "memory-token-upload",
      user: safeUser("admin")
    });

    await expect(
      api.requestMultipart("/api/admin/sites/00000000-0000-4000-8000-000000000002/images/gallery-batch", {
        auth: false,
        body: formData
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "req_upload_public"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000002/images/gallery-batch"
    );
    expect(readHeader(fetchImpl.mock.calls[0][1], "Authorization")).toBeUndefined();
    expect(readHeader(fetchImpl.mock.calls[0][1], "Content-Type")).toBeUndefined();
    expect(fetchImpl.mock.calls[0][1].body).toBe(formData);
  });

  it("clears auth state when refresh fails", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authExpiredResponse("req_needs_refresh"))
      .mockResolvedValueOnce(jsonResponse(401, {
        error: {
          code: "REFRESH_INVALID",
          message: "Refresh token is invalid.",
          requestId: "req_refresh_invalid"
        }
      }));
    const api = createApiClient({ authStore, fetchImpl });

    authStore.setAuthenticated({
      accessToken: "memory-token-expired",
      user: safeUser("editor")
    });

    await expect(api.requestJson("/api/admin/sites", { method: "GET" })).rejects.toMatchObject({
      code: "REFRESH_INVALID",
      requestId: "req_refresh_invalid"
    });
    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getSnapshot()).toEqual({
      state: AUTH_STATES.UNAUTHENTICATED,
      user: null
    });
  });

  it("accepts the current nested me response while bootstrapping after refresh", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "memory-token-me",
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
    const api = createApiClient({ authStore, fetchImpl });

    await expect(api.bootstrapSession()).resolves.toEqual(safeUser("admin"));

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/me"
    ]);
    expect(authStore.getAccessToken()).toBe("memory-token-me");
    expect(authStore.getSnapshot()).toEqual({
      state: AUTH_STATES.AUTHENTICATED,
      user: safeUser("admin")
    });
  });

  it("rejects the legacy direct me user response shape", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "memory-token-legacy",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: safeUser("admin")
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });
    const api = createApiClient({ authStore, fetchImpl });

    await expect(api.bootstrapSession()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "Invalid server response."
    });
    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getSnapshot()).toEqual({
      state: AUTH_STATES.UNAUTHENTICATED,
      user: null
    });
  });

  it("returns a controlled INVALID_RESPONSE for malformed me payloads", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi.fn((requestPath) => {
      if (requestPath === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            accessToken: "memory-token-malformed",
            user: safeUser("admin")
          }
        }));
      }
      if (requestPath === "/api/auth/me") {
        return Promise.resolve(jsonResponse(200, {
          data: {
            user: {
              email: "admin@example.test",
              id: "user-admin",
              role: "viewer"
            }
          }
        }));
      }

      throw new Error(`Unexpected path ${requestPath}`);
    });
    const api = createApiClient({ authStore, fetchImpl });

    await expect(api.bootstrapSession()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 0
    });
  });

  it("normalizes backend errors without retaining raw response data or secrets", () => {
    const error = parseApiError({ status: 400 }, {
      accessToken: "must-not-leak",
      cookie: "refresh_cookie",
      error: {
        code: "VALIDATION_ERROR",
        details: [{ message: "Required", path: "title" }],
        message: "Invalid request.",
        requestId: "req_validation"
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ message: "Required", path: "title" }],
      message: "Invalid request.",
      requestId: "req_validation",
      status: 400
    });
    expect(error).not.toHaveProperty("request");
    expect(error).not.toHaveProperty("response");
    expect(error).not.toHaveProperty("rawBody");
    expect(JSON.stringify(error)).not.toContain("must-not-leak");
    expect(JSON.stringify(error)).not.toContain("refresh_cookie");
  });

  it("passes AbortSignal to fetch and returns a controlled cancellation error", async () => {
    const authStore = createAuthStore();
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError"
    });
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const api = createApiClient({ authStore, fetchImpl });
    const signal = new AbortController().signal;

    await expect(api.requestJson("/api/admin/sites", { method: "GET", signal })).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
      message: "Запрос отменён."
    });
    expect(fetchImpl.mock.calls[0][1].signal).not.toBe(signal);
  });

  it("rejects empty, malformed, and non-JSON successful responses as INVALID_RESPONSE", async () => {
    const scenarios = [
      new Response("", {
        headers: { "Content-Type": "application/json" },
        status: 200
      }),
      new Response("{", {
        headers: { "Content-Type": "application/json" },
        status: 200
      }),
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "text/plain" },
        status: 200
      })
    ];

    for (const response of scenarios) {
      const api = createApiClient({
        authStore: createAuthStore(),
        fetchImpl: vi.fn().mockResolvedValue(response)
      });

      await expect(api.requestJson("/api/admin/sites", { method: "GET" })).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        message: "Сервер вернул некорректный ответ.",
        status: 200
      });
    }
  });

  it("allows 204 only when the caller explicitly expects no response body", async () => {
    const authStore = createAuthStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createApiClient({ authStore, fetchImpl });

    await expect(api.requestJson("/api/admin/sites", { method: "GET" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 204
    });
    await expect(
      api.requestJson("/api/admin/sites/00000000-0000-4000-8000-000000000101/permanent", {
        allowNoContent: true,
        method: "DELETE"
      })
    ).resolves.toBeNull();
  });
});

function authExpiredResponse(requestId) {
  return jsonResponse(401, {
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required.",
      requestId
    }
  });
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

function safeUser(role) {
  return {
    email: `${role}@example.test`,
    id: `user-${role}`,
    role
  };
}
