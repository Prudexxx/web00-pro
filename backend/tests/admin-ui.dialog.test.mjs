import { describe, expect, it, vi } from "vitest";

import { createConfirmationDialog } from "../src/admin/assets/dialog.js";

describe("admin confirmation dialog", () => {
  it("renders semantic safe text, focuses inside, restores focus, and supports cancel/Escape", () => {
    const documentRef = createFakeDocument();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const invoker = documentRef.createElement("button");
    const dialog = createConfirmationDialog({
      cancelLabel: "Отмена",
      confirmLabel: "Удалить",
      description: 'Карточка <img src=x onerror="x">',
      destructive: true,
      documentRef,
      onCancel,
      onConfirm,
      title: 'Удалить <script>alert(1)</script>'
    });

    invoker.focus();
    dialog.open(invoker);

    expect(dialog.element.getAttribute("role")).toBe("dialog");
    expect(dialog.element.getAttribute("aria-modal")).toBe("true");
    expect(dialog.element.getAttribute("data-open")).toBe("true");
    expect(dialog.element.getAttribute("data-variant")).toBe("destructive");
    expect(dialog.element.textContent).toContain('Удалить <script>alert(1)</script>');
    expect(dialog.element.textContent).toContain('Карточка <img src=x onerror="x">');
    expect(dialog.element.querySelector("script")).toBeNull();
    expect(dialog.element.querySelector("img")).toBeNull();
    expect(documentRef.activeElement).not.toBe(invoker);

    dialog.element.querySelector('[data-action="cancel-dialog"]').dispatchEvent(fakeEvent("click"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(documentRef.activeElement).toBe(invoker);

    dialog.open(invoker);
    documentRef.dispatchEvent({ key: "Escape", type: "keydown" });
    expect(dialog.element.getAttribute("data-open")).toBe("false");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(documentRef.activeElement).toBe(invoker);
  });

  it("runs confirm once and blocks double submit while busy", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const onConfirm = vi.fn(() => deferred.promise);
    const dialog = createConfirmationDialog({
      confirmLabel: "Подтвердить",
      description: "Подтвердите действие",
      documentRef,
      onConfirm,
      title: "Действие"
    });

    dialog.open(documentRef.createElement("button"));
    const confirm = dialog.element.querySelector('[data-action="confirm-dialog"]');
    confirm.dispatchEvent(fakeEvent("click"));
    confirm.dispatchEvent(fakeEvent("click"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);

    deferred.resolve();
    await flushPromises();

    expect(dialog.element.getAttribute("data-open")).toBe("false");
  });

  it("requires exact typed confirmation before enabling confirm", async () => {
    const documentRef = createFakeDocument();
    const onConfirm = vi.fn();
    const dialog = createConfirmationDialog({
      confirmationText: "CRM Site / crm-site",
      confirmLabel: "Удалить навсегда",
      description: "Это действие нельзя отменить.",
      destructive: true,
      documentRef,
      onConfirm,
      title: "Permanent delete"
    });

    dialog.open(documentRef.createElement("button"));
    const input = dialog.element.querySelector('[name="typedConfirmation"]');
    const confirm = dialog.element.querySelector('[data-action="confirm-dialog"]');

    expect(confirm.disabled).toBe(true);

    input.value = "crm-site";
    input.dispatchEvent(fakeEvent("input"));
    expect(confirm.disabled).toBe(true);

    input.value = "CRM Site / crm-site";
    input.dispatchEvent(fakeEvent("input"));
    expect(confirm.disabled).toBe(false);

    confirm.dispatchEvent(fakeEvent("click"));
    await flushPromises();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows safe error text and request id without closing", async () => {
    const documentRef = createFakeDocument();
    const dialog = createConfirmationDialog({
      confirmLabel: "Подтвердить",
      description: "Проверка ошибки",
      documentRef,
      onConfirm: vi.fn().mockRejectedValue({
        message: 'Conflict <img src=x onerror="x">',
        requestId: 'req_<script>x</script>'
      }),
      title: "Ошибка"
    });

    dialog.open(documentRef.createElement("button"));
    dialog.element.querySelector('[data-action="confirm-dialog"]').dispatchEvent(fakeEvent("click"));
    await flushPromises();

    expect(dialog.element.getAttribute("data-open")).toBe("true");
    expect(dialog.element.textContent).toContain('Conflict <img src=x onerror="x">');
    expect(dialog.element.textContent).toContain('req_<script>x</script>');
    expect(dialog.element.querySelector("img")).toBeNull();
    expect(dialog.element.querySelector("script")).toBeNull();
  });
});

function createFakeDocument() {
  const documentRef = {
    activeElement: null,
    listeners: new Map(),
    createElement(tagName) {
      return new FakeElement(tagName, documentRef);
    },
    createTextNode(text) {
      return new FakeTextNode(text);
    },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      this.listeners.set(type, listeners.filter((item) => item !== listener));
    },
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) ?? []) {
        listener.call(this, event);
      }
    }
  };

  return documentRef;
}

class FakeTextNode {
  constructor(text) {
    this.children = [];
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.attributes = new Map();
    this.children = [];
    this.disabled = false;
    this.listeners = new Map();
    this.ownerDocument = ownerDocument;
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
    this.ownerDocument.activeElement = this;
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
      if (match === null) return false;
      const [, name, value] = match;
      return value === "" ? this.attributes.has(name) : this.getAttribute(name) === value;
    }
    return this.tagName === selector.toLowerCase();
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.ownTextContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "disabled") this.disabled = true;
    if (name === "name") this.name = String(value);
    if (name === "type") this.type = String(value);
    if (name === "value") this.value = String(value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
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

function fakeEvent(type) {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: null,
    type
  };
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
}
