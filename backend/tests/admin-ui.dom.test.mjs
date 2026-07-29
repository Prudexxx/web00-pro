import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createElement,
  createExternalLink,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setText
} from "../src/admin/assets/dom.js";

describe("admin safe DOM utilities", () => {
  it("renders API strings and HTML-like titles as plain text", () => {
    const documentRef = createFakeDocument();
    const title = createElement("h2", {
      documentRef,
      text: '<img src=x onerror="alert(1)">'
    });
    const code = createElement("span", {
      documentRef,
      text: "VALIDATION_ERROR"
    });
    const parent = documentRef.createElement("section");

    replaceContent(parent, title, code);
    setText(code, "req_<script>alert(1)</script>");

    expect(parent.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(parent.textContent).toContain("req_<script>alert(1)</script>");
    expect(parent.querySelector("img")).toBeNull();
  });

  it("allows only safe external links and hardens target blank links", () => {
    const documentRef = createFakeDocument();
    const link = createExternalLink("https://example.test/path", "Открыть", {
      documentRef
    });

    expect(link.tagName).toBe("a");
    expect(link.getAttribute("href")).toBe("https://example.test/path");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");

    for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url"]) {
      expect(() => createExternalLink(url, "bad", { documentRef })).toThrow(
        "Only http and https external links are allowed."
      );
    }
  });

  it("creates request id copy controls without HTML injection", async () => {
    const documentRef = createFakeDocument();
    const clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error("clipboard denied"))
    };
    const control = createRequestIdControl('req_<img src=x onerror="x">', {
      clipboard,
      documentRef
    });

    expect(control.textContent).toContain('req_<img src=x onerror="x">');
    expect(control.querySelector("img")).toBeNull();

    control.querySelector("button").dispatchEvent(createFakeEvent("click"));
    await flushPromises();

    expect(clipboard.writeText).toHaveBeenCalledWith('req_<img src=x onerror="x">');
    expect(control.textContent).toContain("Не удалось скопировать");
  });

  it("creates live regions with explicit politeness", () => {
    const region = createLiveRegion({
      documentRef: createFakeDocument(),
      politeness: "assertive"
    });

    expect(region.getAttribute("aria-live")).toBe("assertive");
    expect(region.getAttribute("role")).toBe("status");
  });

  it("keeps unsafe DOM parser APIs out of the production helper", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src", "admin", "assets", "dom.js"),
      "utf8"
    );

    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
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
    this.children = [];
    this.parentNode = null;
    this.textContent = String(text);
  }
}

class FakeElement {
  constructor(tagName) {
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.tagName = tagName.toLowerCase();
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
    return this.tagName === selector.toLowerCase();
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
