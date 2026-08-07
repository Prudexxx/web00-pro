import { AppError } from "../../lib/errors.js";

export const PUBLIC_RUNTIME_MANIFEST_PATH = "catalog/v1/manifest.json";
export const PUBLIC_RUNTIME_RELEASES_PREFIX = "catalog/v1/releases";

export interface RuntimePutResult {
  checksumSha256?: string;
  etag?: string;
  versionId?: string;
}

export interface RuntimeReadResult {
  body: Buffer;
  cacheControl?: string;
  contentType?: string;
  etag?: string;
  versionId?: string;
}

export interface RuntimePutObjectInput {
  body: Buffer;
  contentType: "application/json; charset=utf-8";
  path: string;
  sha256: string;
}

export interface PublicRuntimeStorage {
  getAuthenticatedObject(input: { path: string; timeoutMs?: number }): Promise<RuntimeReadResult>;
  getPublicObject(input: { addNonce?: boolean; path: string; timeoutMs?: number }): Promise<RuntimeReadResult>;
  getPublicUrl(path: string): string;
  putImmutableObject(input: RuntimePutObjectInput): Promise<RuntimePutResult>;
  putMutableManifest(input: RuntimePutObjectInput): Promise<RuntimePutResult>;
}

export interface PublicRuntimePathBuilder {
  manifestPath(): string;
  publicUrl(path: string): string;
  snapshotPath(revision: number, sha256: string): string;
  validatePath(path: string): string;
}

export function createPublicRuntimePathBuilder(options: {
  prefix?: string | undefined;
  publicBaseUrl: string;
}): PublicRuntimePathBuilder {
  const prefix = normalizeRuntimePrefix(options.prefix ?? "");
  const publicBaseUrl = sanitizePublicBaseUrl(options.publicBaseUrl);

  return {
    manifestPath() {
      return joinRuntimePath(prefix, PUBLIC_RUNTIME_MANIFEST_PATH);
    },
    publicUrl(path) {
      const safePath = assertRuntimeObjectPath(path);
      const url = new URL(publicBaseUrl);
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/${safePath}`.replace(/\/{2,}/g, "/");
      url.search = "";
      url.hash = "";
      return url.toString();
    },
    snapshotPath(revision, sha256) {
      assertPositiveRevision(revision);
      assertSha256(sha256);
      return joinRuntimePath(prefix, `${PUBLIC_RUNTIME_RELEASES_PREFIX}/revision-${revision}-${sha256}.json`);
    },
    validatePath(path) {
      return assertRuntimeObjectPath(path);
    }
  };
}

export function normalizeRuntimePrefix(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (trimmed.startsWith("//")) {
    throw storageConfigurationInvalid();
  }
  const raw = trimmed.replace(/^\/+|\/+$/g, "");
  if (raw === "") return "";
  return assertSafePathSegmentPath(raw, "prefix");
}

export function assertRuntimeObjectPath(path: string): string {
  const raw = String(path ?? "").trim();
  if (raw === "") throw storageConfigurationInvalid();
  const normalized = assertSafePathSegmentPath(raw, "path");
  const unprefixed = stripOptionalPrefix(normalized);
  if (
    unprefixed !== PUBLIC_RUNTIME_MANIFEST_PATH &&
    !/^catalog\/v1\/releases\/revision-[1-9][0-9]*-[a-f0-9]{64}\.json$/.test(unprefixed)
  ) {
    throw storageConfigurationInvalid();
  }
  return normalized;
}

export function assertPositiveRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw storageConfigurationInvalid();
  }
  return value;
}

export function assertSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw storageConfigurationInvalid();
  }
  return value;
}

function joinRuntimePath(prefix: string, path: string): string {
  return prefix === "" ? path : `${prefix}/${path}`;
}

function stripOptionalPrefix(path: string): string {
  const marker = "/catalog/v1/";
  const index = path.indexOf(marker);
  return index === -1 ? path : path.slice(index + 1);
}

function sanitizePublicBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw storageConfigurationInvalid();
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") {
    throw storageConfigurationInvalid();
  }
  return parsed.href.replace(/\/+$/, "");
}

function assertSafePathSegmentPath(value: string, _field: string): string {
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    throw storageConfigurationInvalid();
  }

  const segments = value.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw storageConfigurationInvalid();
    }
    let decoded = segment;
    for (let pass = 0; pass < 4; pass += 1) {
      if (/%(?:2e|2f|5c|00)/i.test(decoded)) {
        throw storageConfigurationInvalid();
      }
      let next: string;
      try {
        next = decodeURIComponent(decoded.replace(/%(?![0-9a-f]{2})/gi, "%25"));
      } catch {
        throw storageConfigurationInvalid();
      }
      if (next === decoded) break;
      decoded = next;
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
        throw storageConfigurationInvalid();
      }
    }
  }
  return value;
}

function storageConfigurationInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
    message: "Public runtime storage configuration is invalid.",
    statusCode: 503
  });
}
