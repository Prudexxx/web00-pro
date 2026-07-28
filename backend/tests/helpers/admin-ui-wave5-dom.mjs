export function createFakeDocument(options = {}) {
  const documentRef = new FakeDocument(options);
  return documentRef;
}

export function fakeEvent(type, overrides = {}) {
  return {
    defaultPrevented: false,
    key: overrides.key,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    target: null,
    type,
    ...overrides
  };
}

export function click(root, selector) {
  const node = root.querySelector(selector);
  if (node === null) {
    throw new Error(`Missing clickable selector ${selector}`);
  }
  node.dispatchEvent(fakeEvent("click"));
  return node;
}

export function submit(root, selector) {
  const node = root.querySelector(selector);
  if (node === null) {
    throw new Error(`Missing form selector ${selector}`);
  }
  node.dispatchEvent(fakeEvent("submit"));
  return node;
}

export function setValue(root, name, value) {
  const node = root.querySelector(`[name="${name}"]`);
  if (node === null) {
    throw new Error(`Missing field ${name}`);
  }
  node.value = String(value);
  node.dispatchEvent(fakeEvent("input"));
  node.dispatchEvent(fakeEvent("change"));
  return node;
}

export function setChecked(root, name, checked) {
  const node = root.querySelector(`[name="${name}"]`);
  if (node === null) {
    throw new Error(`Missing checkbox ${name}`);
  }
  node.checked = checked === true;
  if (node.checked) {
    node.setAttribute("checked", "");
  } else {
    node.removeAttribute("checked");
  }
  node.dispatchEvent(fakeEvent("change"));
  return node;
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

export async function waitFor(assertion, options = {}) {
  const attempts = options.attempts ?? 40;
  const intervalMs = options.intervalMs ?? 0;
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const value = assertion();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError !== undefined) {
    throw lastError;
  }
  throw new Error("Timed out waiting for condition.");
}

class FakeDocument {
  constructor(options = {}) {
    this.body = new FakeElement("body");
    this.defaultView = {};
    this.listeners = new Map();
    this.navigator = {
      clipboard: options.clipboard
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createTextNode(text) {
    return new FakeTextNode(text);
  }

  dispatchEvent(event) {
    event.target = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((item) => item !== listener)
    );
  }
}

class FakeTextNode {
  constructor(text) {
    this.children = [];
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName) {
    this.attributes = new Map();
    this.checked = false;
    this.children = [];
    this.disabled = false;
    this.files = [];
    this.focused = false;
    this.listeners = new Map();
    this.parentNode = null;
    this.tagName = tagName.toLowerCase();
    this.value = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined) {
        continue;
      }
      const child = typeof node === "string" ? new FakeTextNode(node) : node;
      child.parentNode = this;
      this.children.push(child);
    }
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
    const normalized = selector.trim();
    if (normalized.length === 0 || normalized.includes(" ")) {
      return false;
    }
    if (normalized.startsWith(".")) {
      return (this.getAttribute("class") ?? "")
        .split(/\s+/)
        .includes(normalized.slice(1));
    }

    const compound = /^([a-z0-9-]+)?(\[[^\]]+\])$/i.exec(normalized);
    if (compound !== null) {
      const [, tagName, attributeSelector] = compound;
      return (
        (tagName === undefined || this.tagName === tagName.toLowerCase()) &&
        matchesAttribute(this, attributeSelector)
      );
    }

    if (normalized.startsWith("[")) {
      return matchesAttribute(this, normalized);
    }

    return this.tagName === normalized.toLowerCase();
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "disabled") {
      this.disabled = false;
    }
    if (name === "checked") {
      this.checked = false;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "checked") {
      this.checked = true;
    }
    if (name === "disabled") {
      this.disabled = true;
    }
    if (name === "name") {
      this.name = String(value);
    }
    if (name === "type") {
      this.type = String(value);
    }
    if (name === "value") {
      this.value = String(value);
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

function matchesAttribute(node, selector) {
  const match = /^\[([^=\]]+)(?:="?([^\]"]*)"?)?\]$/.exec(selector);
  if (match === null) {
    return false;
  }
  const [, name, value] = match;
  return value === undefined ? node.attributes.has(name) : node.getAttribute(name) === value;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
