const JSON_CONTENT_TYPE = "application/json";
const REFRESHABLE_AUTH_CODE = "UNAUTHORIZED";

export const ADMIN_REQUEST_TIMEOUTS = Object.freeze({
  jsonGet: 25_000,
  jsonMutation: 45_000,
  multipart: 240_000,
  readinessAttempt: 15_000,
  readinessTotal: 90_000
});

export class AdminApiError extends Error {
  constructor({ code, details, message, requestId, status }) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.status = status;
  }
}

export function createApiClient(options) {
  const authStore = options?.authStore;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  let refreshPromise = null;

  if (typeof fetchImpl !== "function") {
    throw new Error("Admin API client requires fetch.");
  }
  if (authStore === undefined || typeof authStore.getAccessToken !== "function") {
    throw new Error("Admin API client requires an auth store.");
  }

  async function refreshAccess({ signal } = {}) {
    if (refreshPromise === null) {
      authStore.setState("REFRESHING");
      refreshPromise = doRefresh({ signal }).finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  }

  async function doRefresh({ signal } = {}) {
    try {
      const response = await fetchImpl("/api/auth/refresh", {
        credentials: "same-origin",
        headers: {
          Accept: JSON_CONTENT_TYPE
        },
        method: "POST",
        signal
      });
      const body = await readResponseBody(response);

      if (!response.ok) {
        throw parseApiError(response, body);
      }

      const data = readData(body);
      const nextAccessToken = readAccessToken(data);
      authStore.setAuthenticated({
        accessToken: nextAccessToken,
        user: data.user ?? authStore.getSnapshot().user
      });

      return data.user ?? null;
    } catch (error) {
      authStore.clear();
      throw normalizeThrownError(error);
    }
  }

  async function requestJson(path, requestOptions = {}, replayed = false) {
    assertApiPath(path);

    try {
      const response = await fetchImpl(path, toJsonFetchOptions(requestOptions, authStore));
      const body = await readResponseBody(response);

      if (isAuthExpiredResponse(response, body) && requestOptions.auth !== false && !replayed) {
        await refreshAccess();
        return requestJson(path, requestOptions, true);
      }

      if (!response.ok) {
        throw parseApiError(response, body);
      }

      return body;
    } catch (error) {
      throw normalizeThrownError(error);
    }
  }

  async function requestMultipart(path, requestOptions = {}, replayed = false) {
    assertApiPath(path);

    try {
      const response = await fetchImpl(path, toMultipartFetchOptions(requestOptions, authStore));
      const body = await readResponseBody(response);

      if (isAuthExpiredResponse(response, body) && requestOptions.auth !== false && !replayed) {
        await refreshAccess({ signal: requestOptions.signal });
        return requestMultipart(path, requestOptions, true);
      }

      if (!response.ok) {
        throw parseApiError(response, body);
      }

      return body;
    } catch (error) {
      throw normalizeThrownError(error);
    }
  }

  async function bootstrapSession({ signal } = {}) {
    authStore.setState("BOOTSTRAPPING");

    try {
      await refreshAccess({ signal });
      const me = await requestJson("/api/auth/me", { method: "GET", signal });
      const user = readMeUser(me);

      authStore.setAuthenticated({
        accessToken: authStore.getAccessToken(),
        user
      });

      return user;
    } catch (error) {
      authStore.clear();
      throw normalizeThrownError(error);
    }
  }

  async function login({ email, password, signal }) {
    const loginResponse = await requestJson("/api/auth/login", {
      auth: false,
      body: { email, password },
      credentials: "same-origin",
      method: "POST",
      signal
    });
    const loginData = readData(loginResponse);
    const nextAccessToken = readAccessToken(loginData);

    authStore.setAuthenticated({
      accessToken: nextAccessToken,
      user: loginData.user ?? null
    });

    const me = await requestJson("/api/auth/me", { method: "GET", signal });
    const user = readMeUser(me);

    authStore.setAuthenticated({
      accessToken: nextAccessToken,
      user
    });

    return user;
  }

  async function logout({ signal } = {}) {
    try {
      const response = await fetchImpl("/api/auth/logout", {
        credentials: "same-origin",
        headers: {
          Accept: JSON_CONTENT_TYPE
        },
        method: "POST",
        signal
      });
      const body = await readResponseBody(response);

      if (!response.ok) {
        throw parseApiError(response, body);
      }
    } catch (error) {
      throw normalizeThrownError(error);
    }
  }

  return {
    bootstrapSession,
    login,
    logout,
    requestJson,
    requestMultipart
  };
}

export function parseApiError(response, body) {
  const envelope = isRecord(body) && isRecord(body.error) ? body.error : {};
  const details = Array.isArray(envelope.details)
    ? envelope.details.map(normalizeDetail).filter((detail) => detail !== null)
    : [];

  return new AdminApiError({
    code: readSafeIdentifier(envelope.code) ?? "REQUEST_FAILED",
    details,
    message: readSafeText(envelope.message) ?? "Request failed.",
    requestId: readSafeText(envelope.requestId) ?? null,
    status: typeof response?.status === "number" ? response.status : 0
  });
}

export function isMultipartBody(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function assertApiPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw invalidApiPath();
  }
  if (!path.startsWith("/api/") || path.startsWith("//") || /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) {
    throw invalidApiPath();
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw invalidApiPath();
  }

  if (decodedPath.split(/[?#]/, 1)[0].split("/").includes("..")) {
    throw invalidApiPath();
  }
}

function invalidApiPath() {
  return new AdminApiError({
    code: "INVALID_API_PATH",
    details: [],
    message: "Only same-origin API paths are allowed.",
    requestId: null,
    status: 0
  });
}

function toJsonFetchOptions(options, authStore) {
  const headers = {
    Accept: JSON_CONTENT_TYPE,
    ...headersToObject(options.headers)
  };
  const request = {
    credentials: options.credentials,
    headers,
    method: options.method ?? "GET",
    signal: options.signal
  };

  if (options.auth !== false) {
    const accessToken = authStore.getAccessToken();
    if (accessToken !== null) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = JSON_CONTENT_TYPE;
    request.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return removeUndefinedValues(request);
}

function toMultipartFetchOptions(options = {}, authStore) {
  const headers = {
    Accept: JSON_CONTENT_TYPE,
    ...headersToObject(options.headers)
  };

  if (options.auth !== false) {
    const accessToken = authStore.getAccessToken();
    if (accessToken !== null) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  return removeUndefinedValues({
    body: options.body,
    credentials: options.credentials,
    headers,
    method: options.method ?? "POST",
    signal: options.signal
  });
}

async function readResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text === "") {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAuthExpiredResponse(response, body) {
  return (
    response.status === 401 &&
    isRecord(body) &&
    isRecord(body.error) &&
    body.error.code === REFRESHABLE_AUTH_CODE
  );
}

function readData(body) {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new AdminApiError({
      code: "INVALID_RESPONSE",
      details: [],
      message: "Invalid server response.",
      requestId: null,
      status: 0
    });
  }

  return body.data;
}

function readMeUser(body) {
  const data = readData(body);

  if (!isRecord(data.user)) {
    throw invalidResponse();
  }

  return readSafeUser(data.user);
}

function invalidResponse() {
  return new AdminApiError({
    code: "INVALID_RESPONSE",
    details: [],
    message: "Invalid server response.",
    requestId: null,
    status: 0
  });
}

function readAccessToken(data) {
  if (typeof data.accessToken !== "string" || data.accessToken.length === 0) {
    throw new AdminApiError({
      code: "INVALID_RESPONSE",
      details: [],
      message: "Invalid server response.",
      requestId: null,
      status: 0
    });
  }

  return data.accessToken;
}

function readSafeUser(data) {
  if (
    typeof data.email !== "string" ||
    typeof data.id !== "string" ||
    (data.role !== "admin" && data.role !== "editor")
  ) {
    throw new AdminApiError({
      code: "INVALID_RESPONSE",
      details: [],
      message: "Invalid server response.",
      requestId: null,
      status: 0
    });
  }

  return {
    email: data.email,
    id: data.id,
    role: data.role
  };
}

function normalizeThrownError(error) {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (isRecord(error) && error.name === "AbortError") {
    return new AdminApiError({
      code: "REQUEST_ABORTED",
      details: [],
      message: "Request was cancelled.",
      requestId: null,
      status: 0
    });
  }

  return new AdminApiError({
    code: "NETWORK_ERROR",
    details: [],
    message: "Unable to reach the server.",
    requestId: null,
    status: 0
  });
}

function normalizeDetail(input) {
  if (!isRecord(input)) {
    return null;
  }

  const message = readSafeText(input.message);
  if (message === null) {
    return null;
  }

  return removeUndefinedValues({
    code: readSafeIdentifier(input.code) ?? undefined,
    message,
    path: readSafeText(input.path) ?? undefined
  });
}

function readSafeIdentifier(input) {
  if (typeof input !== "string" || !/^[A-Z0-9_]{1,80}$/.test(input)) {
    return null;
  }

  return input;
}

function readSafeText(input) {
  if (typeof input !== "string") {
    return null;
  }

  return input.slice(0, 500);
}

function headersToObject(headers) {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (isRecord(headers)) {
    return { ...headers };
  }

  return {};
}

function removeUndefinedValues(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
