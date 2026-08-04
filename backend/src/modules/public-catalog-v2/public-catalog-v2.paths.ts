export const PUBLIC_CATALOG_V2_SCHEMA_VERSION = 2;
export const PUBLIC_CATALOG_V2_JSON_BUCKET = "web00-public-catalog";
export const PUBLIC_CATALOG_V2_IMAGE_BUCKET = "web00-catalog-images";
export const PUBLIC_CATALOG_V2_ACTIVE_PATH = "public-catalog/v2/active.json";

export type PublicCatalogV2ReleaseArtifactKind = "categories" | "index" | "manifest" | "popular";

const RELEASE_ARTIFACT_FILENAMES: Record<PublicCatalogV2ReleaseArtifactKind, string> = {
  categories: "categories.json",
  index: "index.json",
  manifest: "manifest.json",
  popular: "popular.json"
};

export function buildPublicCatalogV2ActivePath(): string {
  return PUBLIC_CATALOG_V2_ACTIVE_PATH;
}

export function buildPublicCatalogV2ReleaseRoot(revision: number): string {
  assertSafeRevision(revision);
  return `public-catalog/v2/releases/revision-${revision}`;
}

export function buildPublicCatalogV2ReleasePath(
  revision: number,
  kind: PublicCatalogV2ReleaseArtifactKind
): string {
  assertSafeRevision(revision);
  const filename = RELEASE_ARTIFACT_FILENAMES[kind];
  if (filename === undefined) {
    throw new Error("Invalid Public Catalog V2 Storage path.");
  }

  return `${buildPublicCatalogV2ReleaseRoot(revision)}/${filename}`;
}

export function buildPublicCatalogV2ChunkPath(revision: number, chunkIndex: number): string {
  assertSafeRevision(revision);
  assertSafeChunkIndex(chunkIndex);
  return `${buildPublicCatalogV2ReleaseRoot(revision)}/chunks/chunk-${String(chunkIndex).padStart(6, "0")}.json`;
}

export function assertPublicCatalogV2StoragePath(path: string): void {
  if (!isPublicCatalogV2StoragePath(path)) {
    throw new Error("Invalid Public Catalog V2 Storage path.");
  }
}

export function isPublicCatalogV2StoragePath(path: string): boolean {
  const chunkMatch = /^public-catalog\/v2\/releases\/revision-[1-9][0-9]*\/chunks\/chunk-([0-9]{6})\.json$/.exec(path);
  if (
    path !== PUBLIC_CATALOG_V2_ACTIVE_PATH &&
    !/^public-catalog\/v2\/releases\/revision-[1-9][0-9]*\/(?:manifest|index|popular|categories)\.json$/.test(path) &&
    chunkMatch === null
  ) {
    return false;
  }
  if (chunkMatch !== null && Number(chunkMatch[1]) < 1) {
    return false;
  }

  return !hasUnsafePathCharacters(path);
}

export function buildPublicCatalogV2ActivationPlan(revision: number): string[] {
  assertSafeRevision(revision);
  return [
    buildPublicCatalogV2ChunkPath(revision, 1),
    buildPublicCatalogV2ReleasePath(revision, "index"),
    buildPublicCatalogV2ReleasePath(revision, "popular"),
    buildPublicCatalogV2ReleasePath(revision, "categories"),
    buildPublicCatalogV2ReleasePath(revision, "manifest"),
    buildPublicCatalogV2ActivePath()
  ];
}

export function buildPublicCatalogV2RollbackPlan(input: { fromRevision: number; toRevision: number }): {
  activePointerPath: string;
  eventType: "rollback";
  forcePush: false;
  oldReleaseReadable: string;
  previousRevision: number;
  reconcileDbFinalizeAfterPointer: true;
  targetRevision: number;
  targetReleaseReadable: string;
  v1RecoveryRetainedUntil: "OPV2-10_E2E_PASS";
} {
  assertSafeRevision(input.fromRevision);
  assertSafeRevision(input.toRevision);
  return {
    activePointerPath: buildPublicCatalogV2ActivePath(),
    eventType: "rollback",
    forcePush: false,
    oldReleaseReadable: buildPublicCatalogV2ReleasePath(input.fromRevision, "manifest"),
    previousRevision: input.fromRevision,
    reconcileDbFinalizeAfterPointer: true,
    targetRevision: input.toRevision,
    targetReleaseReadable: buildPublicCatalogV2ReleasePath(input.toRevision, "manifest"),
    v1RecoveryRetainedUntil: "OPV2-10_E2E_PASS"
  };
}

export function parsePublicCatalogV2RevisionFromPath(path: string): number {
  assertPublicCatalogV2StoragePath(path);
  if (path === PUBLIC_CATALOG_V2_ACTIVE_PATH) {
    throw new Error("Invalid Public Catalog V2 Storage path.");
  }
  const match = /^public-catalog\/v2\/releases\/revision-([1-9][0-9]*)\//.exec(path);
  if (match === null) {
    throw new Error("Invalid Public Catalog V2 Storage path.");
  }

  return Number(match[1]);
}

export function assertPublicCatalogV2Bucket(bucketId: string): void {
  if (bucketId !== PUBLIC_CATALOG_V2_JSON_BUCKET) {
    throw new Error("Invalid Public Catalog V2 Storage bucket.");
  }
}

function assertSafeRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Invalid Public Catalog V2 revision.");
  }
}

function assertSafeChunkIndex(chunkIndex: number): void {
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 1) {
    throw new Error("Invalid Public Catalog V2 chunk index.");
  }
}

function hasUnsafePathCharacters(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    path.includes("\\") ||
    path.includes("..") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("://") ||
    path.includes("@") ||
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c") ||
    path.startsWith("/") ||
    path.includes("//") ||
    path.startsWith(`${PUBLIC_CATALOG_V2_IMAGE_BUCKET}/`)
  );
}
