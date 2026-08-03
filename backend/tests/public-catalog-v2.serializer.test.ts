import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const serializerModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.serializer.js";

async function importSerializerModule(): Promise<Record<string, unknown>> {
  try {
    return await import(serializerModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 serializer module to exist; OPV2-1 is RED until exact-byte serialization is implemented.",
      { cause: error }
    );
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected Public Catalog V2 serializer export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

describe("Public Catalog V2 serializer", () => {
  it("produces deterministic bytes with a trailing newline and checksum over exact bytes", async () => {
    const module = await importSerializerModule();
    const stableSerializeJson = readFunction(module, "stableSerializeJson");
    const sha256Hex = readFunction(module, "sha256Hex");

    const left = stableSerializeJson({ b: 2, a: { d: 4, c: 3 } });
    const right = stableSerializeJson({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe(right);
    expect(left).toBe("{\"a\":{\"c\":3,\"d\":4},\"b\":2}\n");
    expect(sha256Hex(left)).toBe(createHash("sha256").update(String(left), "utf8").digest("hex"));
  });

  it("verifies parsed exact bytes before accepting any release artifact checksum", async () => {
    const module = await importSerializerModule();
    const buildVerifiedJsonArtifact = readFunction(module, "buildVerifiedJsonArtifact");

    const artifact = buildVerifiedJsonArtifact({
      expectedRevision: 12,
      kind: "index",
      payload: {
        items: [{ slug: "synthetic-v2-fixture" }],
        itemsCount: 1,
        revision: 12,
        schemaVersion: 2
      }
    }) as { bytes: string; parsed: { revision: number; itemsCount: number }; sha256: string };

    expect(JSON.parse(artifact.bytes)).toEqual(artifact.parsed);
    expect(artifact.parsed.revision).toBe(12);
    expect(artifact.parsed.itemsCount).toBe(1);
    expect(artifact.sha256).toBe(createHash("sha256").update(artifact.bytes, "utf8").digest("hex"));
  });
});
