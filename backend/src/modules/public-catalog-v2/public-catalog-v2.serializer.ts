import { createHash } from "node:crypto";

export type PublicCatalogV2ArtifactKind =
  | "active"
  | "categories"
  | "chunk"
  | "index"
  | "manifest"
  | "popular";

export interface VerifiedJsonArtifact<TParsed = unknown> {
  byteLength: number;
  bytes: string;
  kind: PublicCatalogV2ArtifactKind;
  parsed: TParsed;
  sha256: string;
}

export function stableSerializeJson(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

export function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function buildVerifiedJsonArtifact<TParsed extends { revision?: number; schemaVersion?: number }>(input: {
  expectedRevision?: number;
  kind: PublicCatalogV2ArtifactKind;
  payload: TParsed;
  validate?: (parsed: unknown) => TParsed;
}): VerifiedJsonArtifact<TParsed> {
  const bytes = stableSerializeJson(input.payload);
  const parsed = input.validate === undefined ? (JSON.parse(bytes) as TParsed) : input.validate(JSON.parse(bytes));

  if (
    input.expectedRevision !== undefined &&
    "revision" in parsed &&
    parsed.revision !== input.expectedRevision
  ) {
    throw new Error("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");
  }

  if (stableSerializeJson(parsed) !== bytes) {
    throw new Error("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");
  }

  return {
    byteLength: Buffer.byteLength(bytes, "utf8"),
    bytes,
    kind: input.kind,
    parsed,
    sha256: sha256Hex(bytes)
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
    }
    return JSON.stringify(value);
  }

  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
  }

  if (typeof value === "string") {
    assertNoUnpairedSurrogate(value);
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.some((item) => item === undefined) || hasSparseArraySlot(value)) {
      throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
    }
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        assertNoUnpairedSurrogate(key);
        return `${JSON.stringify(key)}:${stableStringify(value[key])}`;
      });

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function hasSparseArraySlot(value: unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      return true;
    }
  }

  return false;
}

function assertNoUnpairedSurrogate(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("PUBLIC_CATALOG_V2_SERIALIZATION_UNSUPPORTED");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
