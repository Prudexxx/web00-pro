export function createFakeBrowser(options = {}) {
  const listeners = new Map();
  const document = {
    body: { dataset: { page: options.page || "home" } },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const href = options.href || "https://web00.pro/index.html";
  const window = {
    document,
    location: new URL(href),
    navigator: options.navigator || {},
    console: options.console || console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    WEB00_TEST_MODE: options.testMode !== false,
  };

  document.defaultView = window;
  window.window = window;
  window.self = window;
  window.globalThis = window;

  return { window, document, listeners };
}
