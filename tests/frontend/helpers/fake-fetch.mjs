export function jsonResponse(body, options = {}) {
  const status = options.status || 200;
  const contentType = options.contentType === undefined ? "application/json; charset=utf-8" : options.contentType;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async json() {
      return body;
    },
  };
}

export function createFakeFetch(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  fetch.calls = calls;
  return fetch;
}
