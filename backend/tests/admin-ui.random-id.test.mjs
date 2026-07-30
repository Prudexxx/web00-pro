import { describe, expect, it, vi } from "vitest";

import {
  createRandomUuid,
  createStableClientRequestId
} from "../src/admin/assets/random-id.js";
import {
  readSiteFormDraft,
  writeSiteFormDraft
} from "../src/admin/assets/site-form-drafts.js";

describe("admin secure random IDs", () => {
  it("uses crypto.randomUUID when available", () => {
    const cryptoRef = {
      randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111")
    };

    expect(createRandomUuid(cryptoRef)).toBe("11111111-1111-4111-8111-111111111111");
    expect(createStableClientRequestId(cryptoRef)).toBe("req_11111111-1111-4111-8111-111111111111");
    expect(cryptoRef.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("falls back to crypto.getRandomValues with canonical UUID v4 bits", () => {
    const cryptoRef = {
      getRandomValues: vi.fn((bytes) => {
        bytes.set([
          0x12, 0x34, 0x56, 0x78,
          0x9a, 0xbc, 0xde, 0xf0,
          0x12, 0x34, 0x56, 0x78,
          0x9a, 0xbc, 0xde, 0xf0
        ]);
        return bytes;
      })
    };

    expect(createRandomUuid(cryptoRef)).toBe("12345678-9abc-4ef0-9234-56789abcdef0");
    expect(createStableClientRequestId(cryptoRef)).toBe("req_12345678-9abc-4ef0-9234-56789abcdef0");
  });

  it("persists and restores only exact generated stable request IDs", () => {
    const storage = createMemoryStorage();
    const key = "draft:key";
    const clientRequestId = createStableClientRequestId({
      randomUUID: () => "22222222-2222-4222-8222-222222222222"
    });

    writeSiteFormDraft(storage, key, {
      clientRequestId,
      fields: { title: "Draft" },
      mode: "create",
      siteId: null,
      updatedAt: "2026-07-30T00:00:00.000Z"
    });
    expect(readSiteFormDraft(storage, key)?.clientRequestId).toBe(clientRequestId);

    writeSiteFormDraft(storage, key, {
      clientRequestId: "req_------------------------------------",
      fields: { title: "Draft" },
      mode: "create",
      siteId: null,
      updatedAt: "2026-07-30T00:00:00.000Z"
    });
    expect(readSiteFormDraft(storage, key)?.clientRequestId).toBeNull();
  });

  it("does not fall back to Math.random when secure browser randomness is unavailable", () => {
    const mathRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(() => createRandomUuid({})).toThrow("Браузер не может создать безопасный идентификатор операции.");
    expect(() => createStableClientRequestId({})).toThrow("Браузер не может создать безопасный идентификатор операции.");
    expect(mathRandom).not.toHaveBeenCalled();

    mathRandom.mockRestore();
  });
});

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    removeItem: vi.fn((key) => {
      values.delete(key);
    }),
    setItem: vi.fn((key, value) => {
      values.set(key, String(value));
    })
  };
}
