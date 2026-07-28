const ALLOWED_TAGS = new Set([
  "a",
  "article",
  "button",
  "code",
  "details",
  "div",
  "fieldset",
  "form",
  "h1",
  "h2",
  "h3",
  "header",
  "img",
  "input",
  "label",
  "legend",
  "li",
  "main",
  "nav",
  "option",
  "p",
  "pre",
  "section",
  "select",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "textarea",
  "th",
  "thead",
  "tr",
  "ul"
]);

const ALLOWED_ATTRIBUTES = new Set([
  "autocomplete",
  "accept",
  "alt",
  "checked",
  "class",
  "disabled",
  "for",
  "href",
  "id",
  "inputmode",
  "max",
  "maxlength",
  "min",
  "multiple",
  "name",
  "placeholder",
  "required",
  "rows",
  "selected",
  "rel",
  "role",
  "scope",
  "src",
  "step",
  "tabindex",
  "target",
  "type",
  "value"
]);

const ALLOWED_EVENTS = new Set(["change", "click", "input", "submit"]);
export const SAFE_JSON_LIMITS = Object.freeze({
  maxDepth: 8,
  maxNodes: 1000,
  maxOutputLength: 20000
});
const DEFAULT_JSON_TEXT_LIMIT = SAFE_JSON_LIMITS.maxOutputLength;
const JSON_MARKERS = Object.freeze({
  circular: "[Circular]",
  depth: "[Глубина ограничена]",
  function: "[Функция]",
  nodeBudget: "[Объём ограничен]",
  symbol: "[Символ]",
  unavailable: "[Недоступное значение]",
  undefined: "[Не задано]",
  unsupported: "[Неподдерживаемое значение]"
});

export function createElement(tagName, options = {}) {
  const normalizedTag = normalizeTagName(tagName);
  const documentRef = options.documentRef ?? document;
  const node = documentRef.createElement(normalizedTag);

  if (options.className !== undefined) {
    node.setAttribute("class", String(options.className));
  }

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    setSafeAttribute(node, name, value);
  }

  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    setSafeAttribute(node, `data-${name}`, value);
  }

  for (const [eventName, listener] of Object.entries(options.on ?? {})) {
    if (!ALLOWED_EVENTS.has(eventName) || typeof listener !== "function") {
      throw new Error("Unsupported event binding.");
    }
    node.addEventListener(eventName, listener);
  }

  if (options.text !== undefined) {
    setText(node, options.text);
  }

  node.append(...(options.children ?? []));

  return node;
}

export function setText(node, value) {
  node.textContent = value === null || value === undefined ? "" : String(value);
}

export function replaceContent(parent, ...children) {
  parent.replaceChildren(...children);
}

export function createExternalLink(url, text, options = {}) {
  const parsed = parseExternalUrl(url);
  const link = createElement("a", {
    documentRef: options.documentRef,
    text,
    attributes: {
      href: parsed.href,
      rel: "noopener noreferrer",
      target: "_blank"
    }
  });

  return link;
}

export function createRequestIdControl(requestId, options = {}) {
  const documentRef = options.documentRef ?? document;
  const clipboard = options.clipboard ?? globalThis.navigator?.clipboard;
  const status = createElement("span", {
    documentRef,
    attributes: { "aria-live": "polite" }
  });
  const button = createElement("button", {
    documentRef,
    text: "Скопировать requestId",
    attributes: {
      "data-action": "copy-request-id",
      type: "button"
    }
  });
  const control = createElement("span", {
    documentRef,
    className: "admin-request-id",
    children: [
      createElement("span", {
        documentRef,
        text: requestId
      }),
      button,
      status
    ]
  });

  button.addEventListener("click", async () => {
    try {
      if (clipboard === undefined || typeof clipboard.writeText !== "function") {
        throw new Error("Clipboard unavailable.");
      }

      await clipboard.writeText(String(requestId));
      status.textContent = "Скопировано.";
    } catch {
      status.textContent = "Не удалось скопировать.";
    }
  });

  return control;
}

export function normalizeSafeJson(value, options = {}) {
  const limits = normalizeSafeJsonLimits(options);
  const seen = new WeakSet();
  let visitedNodes = 0;

  return normalizeJsonValue(value, 0);

  function normalizeJsonValue(nextValue, depth) {
    if (nextValue === undefined) {
      return JSON_MARKERS.undefined;
    }
    if (typeof nextValue === "bigint") {
      return `${nextValue.toString()}n`;
    }
    if (typeof nextValue === "function") {
      return JSON_MARKERS.function;
    }
    if (typeof nextValue === "symbol") {
      return JSON_MARKERS.symbol;
    }
    if (nextValue === null || typeof nextValue !== "object") {
      return nextValue;
    }
    if (seen.has(nextValue)) {
      return JSON_MARKERS.circular;
    }
    if (depth >= limits.maxDepth) {
      return JSON_MARKERS.depth;
    }

    visitedNodes += 1;
    if (visitedNodes > limits.maxNodes) {
      return JSON_MARKERS.nodeBudget;
    }

    if (!Array.isArray(nextValue) && Object.prototype.toString.call(nextValue) !== "[object Object]") {
      return JSON_MARKERS.unsupported;
    }

    seen.add(nextValue);
    try {
      if (Array.isArray(nextValue)) {
        return nextValue.map((item) => normalizeJsonValue(item, depth + 1));
      }

      const normalized = {};
      for (const key of Object.keys(nextValue)) {
        try {
          normalized[key] = normalizeJsonValue(nextValue[key], depth + 1);
        } catch {
          normalized[key] = JSON_MARKERS.unavailable;
        }
      }

      return normalized;
    } finally {
      seen.delete(nextValue);
    }
  }
}

export function stringifySafeJson(value, options = {}) {
  const maxOutputLength = normalizeMaxLength(options.maxOutputLength ?? options.maxLength);
  let serialized;

  try {
    serialized = JSON.stringify(value === undefined ? null : normalizeSafeJson(value, options), null, 2);
  } catch {
    serialized = JSON.stringify({
      error: "Unable to serialize value."
    }, null, 2);
  }

  if (serialized === undefined) {
    serialized = "null";
  }
  if (serialized.length <= maxOutputLength) {
    return serialized;
  }

  return truncateJsonText(serialized, maxOutputLength);
}

export function setBusy(element, busy) {
  element.setAttribute("aria-busy", busy ? "true" : "false");

  if ("disabled" in element) {
    element.disabled = busy;
  }
}

export function focusFirstInvalid(form, errors) {
  const fieldName = Object.keys(errors ?? {}).find((name) => name !== "_form");

  if (fieldName === undefined || !/^[A-Za-z0-9_-]+$/.test(fieldName)) {
    return false;
  }

  const target = form.querySelector(`[name="${fieldName}"]`);
  if (target === null || typeof target.focus !== "function") {
    return false;
  }

  target.focus();
  return true;
}

export function createLiveRegion(options = {}) {
  return createElement(options.tagName ?? "p", {
    documentRef: options.documentRef,
    className: options.className,
    attributes: {
      "aria-live": options.politeness ?? "polite",
      role: "status"
    }
  });
}

function normalizeMaxLength(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_JSON_TEXT_LIMIT;
  }

  return Math.max(100, Math.min(SAFE_JSON_LIMITS.maxOutputLength, Math.floor(value)));
}

function normalizeSafeJsonLimits(options) {
  return {
    maxDepth: normalizePositiveInteger(options.maxDepth, SAFE_JSON_LIMITS.maxDepth),
    maxNodes: normalizePositiveInteger(options.maxNodes, SAFE_JSON_LIMITS.maxNodes),
    maxOutputLength: normalizeMaxLength(options.maxOutputLength ?? options.maxLength)
  };
}

function normalizePositiveInteger(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function truncateJsonText(serialized, maxOutputLength) {
  const marker = "\n... [Вывод ограничен; truncated]";

  if (marker.length >= maxOutputLength) {
    return marker.slice(0, maxOutputLength);
  }

  return `${serialized.slice(0, maxOutputLength - marker.length)}${marker}`;
}

function normalizeTagName(tagName) {
  const normalized = String(tagName).toLowerCase();

  if (!ALLOWED_TAGS.has(normalized)) {
    throw new Error("Unsupported element.");
  }

  return normalized;
}

function setSafeAttribute(node, name, value) {
  if (value === undefined || value === null || value === false) {
    return;
  }

  if (!isAllowedAttribute(name)) {
    throw new Error("Unsupported attribute.");
  }

  if (value === true) {
    node.setAttribute(name, "");
    return;
  }

  node.setAttribute(name, String(value));
}

function isAllowedAttribute(name) {
  return (
    ALLOWED_ATTRIBUTES.has(name) ||
    /^aria-[a-z0-9_-]+$/.test(name) ||
    /^data-[a-z0-9_-]+$/.test(name)
  );
}

function parseExternalUrl(url) {
  let parsed;

  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error("Only http and https external links are allowed.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https external links are allowed.");
  }

  return parsed;
}
