import { describe, expect, it } from "vitest";

import {
  SAFE_JSON_LIMITS,
  createElement,
  normalizeSafeJson,
  stringifySafeJson
} from "../src/admin/assets/dom.js";
import { createFakeDocument } from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin UI bounded safe JSON rendering", () => {
  it("exposes the approved default limits", () => {
    expect(SAFE_JSON_LIMITS).toEqual({
      maxDepth: 8,
      maxNodes: 1000,
      maxOutputLength: 20000
    });
  });

  it("limits traversal before final formatting for depth and node count", () => {
    expect(stringifySafeJson(deepObject(12), { maxDepth: 3 })).toContain("[Глубина ограничена]");
    expect(stringifySafeJson({ items: Array.from({ length: 20 }, (_, index) => ({ index })) }, {
      maxNodes: 8
    })).toContain("[Объём ограничен]");
  });

  it("handles cycles, BigInt, functions, symbols, undefined, and getter failures safely", () => {
    const circular = { id: "root" };
    circular.self = circular;
    const withGetter = {};
    Object.defineProperty(withGetter, "secret", {
      enumerable: true,
      get() {
        throw new Error("do not leak this stack");
      }
    });
    const symbol = Symbol("hidden");
    const normalized = normalizeSafeJson({
      bigint: 42n,
      circular,
      fn() {},
      symbol,
      undef: undefined,
      withGetter
    });

    expect(normalized.bigint).toBe("42n");
    expect(normalized.circular.self).toBe("[Circular]");
    expect(normalized.fn).toBe("[Функция]");
    expect(normalized.symbol).toBe("[Символ]");
    expect(normalized.undef).toBe("[Не задано]");
    expect(normalized.withGetter.secret).toBe("[Недоступное значение]");
    expect(stringifySafeJson(normalized)).not.toContain("do not leak this stack");
  });

  it("does not traverse prototypes, execute toJSON, or expand exotic objects", () => {
    const proto = { inherited: "must-not-render" };
    const value = Object.create(proto);
    value.own = "visible";
    value.withToJson = {
      safe: true,
      toJSON() {
        throw new Error("toJSON should not run");
      }
    };
    value.map = new Map([["hidden", "value"]]);
    const output = stringifySafeJson(value);

    expect(output).toContain("visible");
    expect(output).not.toContain("must-not-render");
    expect(output).not.toContain("toJSON should not run");
    expect(output).toContain("[Неподдерживаемое значение]");
  });

  it("truncates final output with an explicit marker while keeping normal JSON deterministic", () => {
    const normal = stringifySafeJson({
      action: "site.publish",
      actor: null,
      next: { status: "published" }
    });
    const truncated = stringifySafeJson({ huge: "x".repeat(500) }, {
      maxOutputLength: 120
    });

    expect(normal).toBe([
      "{",
      '  "action": "site.publish",',
      '  "actor": null,',
      '  "next": {',
      '    "status": "published"',
      "  }",
      "}"
    ].join("\n"));
    expect(truncated.length).toBeLessThanOrEqual(120);
    expect(truncated).toContain("[Вывод ограничен");
  });

  it("renders normalized JSON as text without retaining raw object references in DOM nodes", () => {
    const documentRef = createFakeDocument();
    const raw = { html: '<img src=x onerror="boom">' };
    const code = createElement("code", {
      documentRef,
      text: stringifySafeJson(raw)
    });

    expect(code.textContent).toContain('<img src=x onerror=\\"boom\\">');
    expect(code.querySelector("img")).toBeNull();
    expect(Object.values(code).some((value) => value === raw)).toBe(false);
  });
});

function deepObject(depth) {
  let value = { done: true };

  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }

  return value;
}
