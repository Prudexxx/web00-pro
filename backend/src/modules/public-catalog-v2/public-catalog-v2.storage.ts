import type {
  BuiltPublicCatalogV2Release,
  PublicCatalogV2BuiltArtifact
} from "./public-catalog-v2.builder.js";
import {
  PUBLIC_CATALOG_V2_JSON_BUCKET,
  PUBLIC_CATALOG_V2_SCHEMA_VERSION,
  buildPublicCatalogV2ActivePath
} from "./public-catalog-v2.paths.js";
import { sha256Hex, stableSerializeJson } from "./public-catalog-v2.serializer.js";
import { validatePublicCatalogV2ActivePointer, validatePublicCatalogV2Artifact } from "./public-catalog-v2.schemas.js";

const JSON_CONTENT_TYPE = "application/json";
const IMMUTABLE_UPLOAD_CONCURRENCY = 2;
const PUBLIC_BASE_URL = "https://storage.web00.invalid/storage/v1/object/public";

export interface PublicCatalogV2Storage {
  fetchJsonArtifact(input: {
    bucketId: string;
    path: string;
    signal?: AbortSignal;
  }): Promise<PublicCatalogV2FetchedArtifact>;
  getPublicUrl?: (path: string) => string;
  uploadActivePointer(input: PublicCatalogV2UploadInput): Promise<void>;
  uploadImmutableJsonArtifact(input: PublicCatalogV2UploadInput): Promise<void>;
}

export interface PublicCatalogV2UploadInput {
  body: string;
  bucketId: string;
  cacheControl: string;
  contentType: "application/json";
  path: string;
  signal?: AbortSignal;
  upsert: boolean;
}

export interface PublicCatalogV2FetchedArtifact {
  body: string;
  bucketId: string;
  contentType: string;
  path: string;
}

export interface UploadAndVerifyPublicCatalogV2ReleaseInput {
  activatedAt: Date;
  previousRevision?: number | null;
  release: BuiltPublicCatalogV2Release;
  storage: PublicCatalogV2Storage;
}

export interface UploadAndVerifyPublicCatalogV2ImmutableArtifactsInput {
  release: BuiltPublicCatalogV2Release;
  storage: PublicCatalogV2Storage;
}

export interface UploadAndVerifyPublicCatalogV2ActivePointerInput {
  activatedAt: Date;
  onActivePointerUploaded?: (activePointer: UploadAndVerifyPublicCatalogV2ReleaseResult["activePointer"]) => Promise<void> | void;
  previousRevision?: number | null;
  release: BuiltPublicCatalogV2Release;
  signal?: AbortSignal;
  storage: PublicCatalogV2Storage;
}

export interface UploadAndVerifyPublicCatalogV2ReleaseResult {
    activePointer: {
      manifestSha256: string;
      path: string;
      previousRevision: number | null;
      revision: number;
      sha256: string;
    };
  immutableArtifactsVerified: number;
  replayedImmutableArtifacts: string[];
  uploadOrder: string[];
}

export interface UploadAndVerifyPublicCatalogV2ImmutableArtifactsResult {
  immutableArtifactsVerified: number;
  replayedImmutableArtifacts: string[];
  uploadOrder: string[];
}

export interface UploadAndVerifyPublicCatalogV2ActivePointerResult {
  activePointer: UploadAndVerifyPublicCatalogV2ReleaseResult["activePointer"];
  uploadOrder: string[];
}

interface VerifiedPublicCatalogV2Artifact {
  artifact: PublicCatalogV2BuiltArtifact;
  parsed: Record<string, unknown>;
  replayed: boolean;
}

export async function uploadAndVerifyPublicCatalogV2Release(
  input: UploadAndVerifyPublicCatalogV2ReleaseInput
): Promise<UploadAndVerifyPublicCatalogV2ReleaseResult> {
  const immutable = await uploadAndVerifyPublicCatalogV2ImmutableArtifacts(input);
  const active = await uploadAndVerifyPublicCatalogV2ActivePointer(input);

  return {
    activePointer: active.activePointer,
    immutableArtifactsVerified: immutable.immutableArtifactsVerified,
    replayedImmutableArtifacts: immutable.replayedImmutableArtifacts,
    uploadOrder: [...immutable.uploadOrder, ...active.uploadOrder]
  };
}

export async function uploadAndVerifyPublicCatalogV2ImmutableArtifacts(
  input: UploadAndVerifyPublicCatalogV2ImmutableArtifactsInput
): Promise<UploadAndVerifyPublicCatalogV2ImmutableArtifactsResult> {
  const manifestArtifact = findManifestArtifact(input.release);
  assertActivationInputMatchesManifest(input.release, manifestArtifact);
  const uploadOrder: string[] = [];
  const replayedImmutableArtifacts: string[] = [];
  const verified = await runBounded(input.release.artifacts, IMMUTABLE_UPLOAD_CONCURRENCY, async (artifact) => {
    const result = await uploadAndVerifyImmutableArtifact({
      artifact,
      storage: input.storage,
      uploadOrder
    });
    if (result.replayed) {
      replayedImmutableArtifacts.push(artifact.path);
    }
    return result;
  });
  verifyImmutableReleaseMembership(verified);

  return {
    immutableArtifactsVerified: verified.length,
    replayedImmutableArtifacts,
    uploadOrder
  };
}

export async function uploadAndVerifyPublicCatalogV2ActivePointer(
  input: UploadAndVerifyPublicCatalogV2ActivePointerInput
): Promise<UploadAndVerifyPublicCatalogV2ActivePointerResult> {
  const manifestArtifact = findManifestArtifact(input.release);
  assertActivationInputMatchesManifest(input.release, manifestArtifact);
  const activePointer = buildActivePointerArtifact(input, manifestArtifact);
  const activePointerEvidence = {
    manifestSha256: manifestArtifact.sha256,
    path: activePointer.path,
    previousRevision: input.previousRevision ?? null,
    revision: input.release.activationInput.revision,
    sha256: activePointer.sha256
  };
  const uploadOrder: string[] = [];

  await input.storage.uploadActivePointer({
    body: activePointer.bytes,
    bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
    cacheControl: "no-store",
    contentType: JSON_CONTENT_TYPE,
    path: activePointer.path,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    upsert: true
  });
  uploadOrder.push(activePointer.path);
  await input.onActivePointerUploaded?.(activePointerEvidence);
  const fetchedActive = await input.storage.fetchJsonArtifact({
    bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
    path: activePointer.path,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  verifyFetchedArtifact({
    expectedBytes: activePointer.bytes,
    expectedKind: "active",
    expectedPath: activePointer.path,
    fetched: fetchedActive
  });

  return {
    activePointer: activePointerEvidence,
    uploadOrder
  };
}

async function uploadAndVerifyImmutableArtifact(input: {
  artifact: PublicCatalogV2BuiltArtifact;
  storage: PublicCatalogV2Storage;
  uploadOrder: string[];
}): Promise<VerifiedPublicCatalogV2Artifact> {
  let replayed = false;

  try {
    await input.storage.uploadImmutableJsonArtifact({
      body: input.artifact.bytes,
      bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
      cacheControl: "public, max-age=31536000, immutable",
      contentType: JSON_CONTENT_TYPE,
      path: input.artifact.path,
      upsert: false
    });
  } catch {
    replayed = true;
  }
  input.uploadOrder.push(input.artifact.path);

  const fetched = await input.storage.fetchJsonArtifact({
    bucketId: PUBLIC_CATALOG_V2_JSON_BUCKET,
    path: input.artifact.path
  });
  const parsed = verifyFetchedArtifact({
    expectedBytes: input.artifact.bytes,
    expectedKind: input.artifact.kind,
    expectedPath: input.artifact.path,
    fetched
  });

  return {
    artifact: input.artifact,
    parsed,
    replayed
  };
}

function verifyFetchedArtifact(input: {
  expectedBytes: string;
  expectedKind: PublicCatalogV2BuiltArtifact["kind"] | "active";
  expectedPath: string;
  fetched: PublicCatalogV2FetchedArtifact;
}): Record<string, unknown> {
  if (
    input.fetched.bucketId !== PUBLIC_CATALOG_V2_JSON_BUCKET ||
    input.fetched.path !== input.expectedPath ||
    input.fetched.contentType !== JSON_CONTENT_TYPE ||
    input.fetched.body !== input.expectedBytes ||
    sha256Hex(input.fetched.body) !== sha256Hex(input.expectedBytes)
  ) {
    throw artifactVerifyFailed();
  }

  try {
    return validatePublicCatalogV2Artifact(input.expectedKind, JSON.parse(input.fetched.body));
  } catch {
    throw artifactVerifyFailed();
  }
}

function verifyImmutableReleaseMembership(verifiedArtifacts: VerifiedPublicCatalogV2Artifact[]): void {
  const indexArtifact = verifiedArtifacts.find((verified) => verified.artifact.kind === "index");
  const chunkArtifacts = verifiedArtifacts
    .filter((verified) => verified.artifact.kind === "chunk")
    .sort((left, right) => Number(left.parsed.chunkIndex) - Number(right.parsed.chunkIndex));
  if (indexArtifact === undefined || chunkArtifacts.length === 0) {
    throw artifactVerifyFailed();
  }

  verifyManifestChecksumChain(verifiedArtifacts);

  const chunkSlugs: string[] = [];
  const seenChunkSlugs = new Set<string>();
  for (const verified of chunkArtifacts) {
    const items = readArrayForStorageVerifier(verified.parsed.items);
    for (const item of items) {
      const slug = readStringForStorageVerifier(readRecordForStorageVerifier(item).slug);
      if (seenChunkSlugs.has(slug)) {
        throw artifactVerifyFailed();
      }
      seenChunkSlugs.add(slug);
      chunkSlugs.push(slug);
    }
  }

  const indexSlugs = readArrayForStorageVerifier(indexArtifact.parsed.items).map((item) =>
    readStringForStorageVerifier(readRecordForStorageVerifier(item).slug)
  );
  if (
    indexSlugs.length !== chunkSlugs.length ||
    indexSlugs.some((slug, index) => slug !== chunkSlugs[index])
  ) {
    throw artifactVerifyFailed();
  }
}

function verifyManifestChecksumChain(verifiedArtifacts: VerifiedPublicCatalogV2Artifact[]): void {
  const manifestArtifact = verifiedArtifacts.find((verified) => verified.artifact.kind === "manifest");
  if (manifestArtifact === undefined) {
    throw artifactVerifyFailed();
  }

  const expectedDescriptors = new Map<string, {
    bytes: number;
    itemsCount?: number;
    kind: string;
    sha256: string;
  }>();
  const manifest = manifestArtifact.parsed;
  readArrayForStorageVerifier(manifest.chunks).forEach((chunk) => {
    const descriptor = readRecordForStorageVerifier(chunk);
    expectedDescriptors.set(readStringForStorageVerifier(descriptor.path), {
      bytes: readNumberForStorageVerifier(descriptor.bytes),
      itemsCount: readNumberForStorageVerifier(descriptor.itemsCount),
      kind: "chunk",
      sha256: readStringForStorageVerifier(descriptor.sha256)
    });
  });
  for (const kind of ["index", "popular", "categories"] as const) {
    const descriptor = readRecordForStorageVerifier(manifest[kind]);
    const path = readStringForStorageVerifier(descriptor.path);
    const verified = verifiedArtifacts.find((artifact) => artifact.artifact.path === path);
    expectedDescriptors.set(path, {
      bytes: kind === "index"
        ? readNumberForStorageVerifier(descriptor.bytes)
        : verified?.artifact.byteLength ?? 0,
      kind,
      sha256: readStringForStorageVerifier(descriptor.sha256)
    });
  }

  const immutableArtifacts = verifiedArtifacts.filter((verified) => verified.artifact.kind !== "manifest");
  if (expectedDescriptors.size !== immutableArtifacts.length) {
    throw artifactVerifyFailed();
  }
  for (const verified of immutableArtifacts) {
    const expected = expectedDescriptors.get(verified.artifact.path);
    if (
      expected === undefined ||
      expected.kind !== verified.artifact.kind ||
      expected.sha256 !== verified.artifact.sha256 ||
      expected.bytes !== verified.artifact.byteLength
    ) {
      throw artifactVerifyFailed();
    }
    if (
      expected.itemsCount !== undefined &&
      expected.itemsCount !== readNumberForStorageVerifier(verified.parsed.itemsCount)
    ) {
      throw artifactVerifyFailed();
    }
  }
}

function findManifestArtifact(release: BuiltPublicCatalogV2Release): PublicCatalogV2BuiltArtifact {
  const manifestArtifact = release.artifacts.find((artifact) => artifact.kind === "manifest");
  if (manifestArtifact === undefined) {
    throw artifactVerifyFailed();
  }
  return manifestArtifact;
}

function assertActivationInputMatchesManifest(
  release: BuiltPublicCatalogV2Release,
  manifestArtifact: PublicCatalogV2BuiltArtifact
): void {
  if (
    release.activationInput.manifestPath !== manifestArtifact.path ||
    release.activationInput.manifestSha256 !== manifestArtifact.sha256 ||
    Number((manifestArtifact.parsed as { revision?: unknown }).revision) !== release.activationInput.revision
  ) {
    throw artifactVerifyFailed();
  }
}

function buildActivePointerArtifact(
  input: UploadAndVerifyPublicCatalogV2ReleaseInput,
  manifestArtifact: PublicCatalogV2BuiltArtifact
): {
  bytes: string;
  path: string;
  sha256: string;
} {
  const path = buildPublicCatalogV2ActivePath();
  const manifestPath = manifestArtifact.path;
  const payload = {
    activatedAt: input.activatedAt.toISOString(),
    activeRevision: input.release.activationInput.revision,
    manifestPath,
    manifestSha256: manifestArtifact.sha256,
    manifestUrl:
      input.storage.getPublicUrl?.(manifestPath) ??
      `${PUBLIC_BASE_URL}/${PUBLIC_CATALOG_V2_JSON_BUCKET}/${manifestPath}`,
    previousRevision: input.previousRevision ?? null,
    schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
  };
  validatePublicCatalogV2ActivePointer(payload);
  const bytes = stableSerializeJson(payload);

  return {
    bytes,
    path,
    sha256: sha256Hex(bytes)
  };
}

async function runBounded<TInput, TResult>(
  items: readonly TInput[],
  limit: number,
  operation: (item: TInput) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await operation(item);
    }
  });

  await Promise.all(workers);
  return results;
}

function readRecordForStorageVerifier(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw artifactVerifyFailed();
  }
  return value as Record<string, unknown>;
}

function readArrayForStorageVerifier(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw artifactVerifyFailed();
  }
  return value;
}

function readStringForStorageVerifier(value: unknown): string {
  if (typeof value !== "string") {
    throw artifactVerifyFailed();
  }
  return value;
}

function readNumberForStorageVerifier(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw artifactVerifyFailed();
  }
  return value;
}

function artifactVerifyFailed(): Error {
  return new Error("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");
}
