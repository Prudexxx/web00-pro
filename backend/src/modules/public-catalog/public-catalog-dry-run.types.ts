import type { BuiltPublicCatalogSnapshot } from "./public-catalog.snapshot.js";

export type PublicCatalogDryRunStage =
  | "control_load"
  | "settings_load"
  | "projection_load"
  | "item_map"
  | "item_validate"
  | "catalog_validate"
  | "serialize"
  | "size_validate"
  | "hash"
  | "final_parse_validate";

export type PublicCatalogDryRunReasonCode =
  | "INVALID_GALLERY_JSON"
  | "INVALID_GALLERY_SHAPE"
  | "INVALID_REQUIRED_STRING"
  | "INVALID_OPTIONAL_FIELD"
  | "INVALID_URL"
  | "INVALID_URL_PROTOCOL"
  | "INVALID_URL_CREDENTIALS"
  | "INVALID_URL_FRAGMENT"
  | "INVALID_URL_QUERY"
  | "INVALID_IMAGE_DESCRIPTOR"
  | "INVALID_IMAGE_VARIANTS"
  | "DUPLICATE_SLUG"
  | "INVALID_ITEMS_COUNT"
  | "SNAPSHOT_TOO_LARGE"
  | "SERIALIZATION_UNSUPPORTED_VALUE"
  | "FINAL_SCHEMA_INVALID"
  | "UNKNOWN_MAPPING_FAILURE";

export interface PublicCatalogDryRunBlocker {
  errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED";
  fieldPath: string | null;
  itemIndex: number | null;
  reasonCode: PublicCatalogDryRunReasonCode;
  siteId: string | null;
  slug: string | null;
  stage: PublicCatalogDryRunStage;
}

export interface PublicCatalogDryRunResult {
  blockers: PublicCatalogDryRunBlocker[];
  blockersTruncated: boolean;
  byteLength: number | null;
  durationMs: number;
  itemsCount: number;
  requestId: string;
  revision: number;
  sha256: string | null;
  status: "ready" | "blocked";
}

export interface PublicCatalogSnapshotPreparationReady {
  status: "ready";
  built: BuiltPublicCatalogSnapshot;
  byteLength: number;
  itemsCount: number;
  revision: number;
}

export interface PublicCatalogSnapshotPreparationBlocked {
  status: "blocked";
  blockers: PublicCatalogDryRunBlocker[];
  blockersTruncated: boolean;
  byteLength: null;
  itemsCount: number;
  revision: number;
  sha256: null;
}

export type PublicCatalogSnapshotPreparationResult =
  | PublicCatalogSnapshotPreparationReady
  | PublicCatalogSnapshotPreparationBlocked;
