export const PUBLIC_CATALOG_V2_OPERATION_ACTIONS = [
  "publish",
  "unpublish",
  "settings_publish",
  "reconcile"
] as const;

export const PUBLIC_CATALOG_V2_OPERATION_STATUSES = [
  "queued",
  "running",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export const PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES = [
  "queued",
  "running",
  "retry_wait"
] as const;

export const PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES = [
  "succeeded",
  "failed",
  "cancelled"
] as const;

export const PUBLIC_CATALOG_V2_OPERATION_STAGES = [
  "content_transaction",
  "media_preflight",
  "projection_page",
  "index_build",
  "chunk_build",
  "chunk_upload",
  "chunk_verify",
  "popular_build",
  "popular_upload",
  "popular_verify",
  "categories_build",
  "categories_upload",
  "categories_verify",
  "manifest_build",
  "manifest_upload",
  "manifest_verify",
  "active_build",
  "active_upload",
  "active_verify",
  "db_finalize",
  "reconcile"
] as const;

export const PUBLIC_CATALOG_V2_RELEASE_STATUSES = [
  "building",
  "verified",
  "active",
  "superseded",
  "failed"
] as const;

export const PUBLIC_CATALOG_V2_ACTIVATION_EVENT_TYPES = [
  "activate",
  "rollback",
  "reconcile"
] as const;

export type PublicCatalogV2OperationAction = (typeof PUBLIC_CATALOG_V2_OPERATION_ACTIONS)[number];
export type PublicCatalogV2OperationStatus = (typeof PUBLIC_CATALOG_V2_OPERATION_STATUSES)[number];
export type PublicCatalogV2NonterminalOperationStatus =
  (typeof PUBLIC_CATALOG_V2_NONTERMINAL_OPERATION_STATUSES)[number];
export type PublicCatalogV2TerminalOperationStatus =
  (typeof PUBLIC_CATALOG_V2_TERMINAL_OPERATION_STATUSES)[number];
export type PublicCatalogV2OperationStage = (typeof PUBLIC_CATALOG_V2_OPERATION_STAGES)[number];
export type PublicCatalogV2ReleaseStatus = (typeof PUBLIC_CATALOG_V2_RELEASE_STATUSES)[number];
export type PublicCatalogV2ActivationEventType = (typeof PUBLIC_CATALOG_V2_ACTIVATION_EVENT_TYPES)[number];

export interface CreatePublicationOperationInput {
  action: PublicCatalogV2OperationAction;
  actorUserId?: string | null;
  idempotencyKey: string;
  operationGroupKey: string;
  operationScope: string;
  projectionHash?: string | null;
  requestFingerprint: string;
  requestId: string;
  siteId?: string | null;
  stage?: PublicCatalogV2OperationStage;
  targetRevision: number;
  trigger: string;
}

export interface ClaimPublicationOperationInput {
  leaseId: string;
  lockedBy: string;
  now: Date;
  staleLockedBefore?: Date | null;
}

export interface PublicationCheckpointInput {
  lastCheckpoint: Record<string, unknown>;
  lastErrorCode?: string | null;
  leaseId: string;
  nextRetryAt?: Date | null;
  operationId: string;
  retryCount?: number;
  stage: PublicCatalogV2OperationStage;
  status?: Extract<PublicCatalogV2OperationStatus, "running" | "retry_wait">;
}

export interface FinalizePublicationOperationInput {
  completedAt: Date;
  lastCheckpoint?: Record<string, unknown>;
  lastErrorCode?: string | null;
  leaseId: string;
  operationId: string;
  status: PublicCatalogV2TerminalOperationStatus;
  stage: PublicCatalogV2OperationStage;
}

export interface RecordActivationEventInput {
  activePointerSha256: string;
  eventType: PublicCatalogV2ActivationEventType;
  operationId?: string | null;
  previousRevision?: number | null;
  requestId: string;
  revision: number;
}

export interface PublicationOperationRecord {
  action: string;
  actorUserId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  lastCheckpoint: unknown;
  lastErrorCode: string | null;
  leaseId: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  nextRetryAt: Date | null;
  operationGroupKey: string;
  operationScope: string;
  projectionHash: string | null;
  requestFingerprint: string;
  requestId: string;
  retryCount: number;
  siteId: string | null;
  stage: string;
  status: string;
  targetRevision: number;
  trigger: string;
  updatedAt: Date;
}

export interface PublicCatalogV2ProjectionCursor {
  createdAt: Date;
  id: string;
  slug: string;
  sortOrder: number;
}

export interface PublicCatalogV2ProjectionPage {
  items: PublicCatalogV2ProjectionRecord[];
  nextCursor: PublicCatalogV2ProjectionCursor | null;
}

export interface PublicCatalogV2ProjectionRecord {
  active: boolean;
  categoryId: string;
  createdAt: Date;
  deletedAt: Date | null;
  featured: boolean;
  id: string;
  publishedAt: Date | null;
  slug: string;
  sortOrder: number;
  status: string;
  updatedAt: Date;
}

export interface PublicCatalogV2Repository {
  claimNextPublicationOperation(input: ClaimPublicationOperationInput): Promise<PublicationOperationRecord | null>;
  createOrCoalescePublicationOperation(
    input: CreatePublicationOperationInput
  ): Promise<PublicationOperationRecord>;
  finalizePublicationOperation(input: FinalizePublicationOperationInput): Promise<PublicationOperationRecord>;
  iteratePublicCatalogV2ProjectionPages(input: {
    afterCursor: PublicCatalogV2ProjectionCursor | null;
    take: 100;
  }): AsyncIterable<PublicCatalogV2ProjectionPage>;
  recordActivationEvent(input: RecordActivationEventInput): Promise<void>;
  recordPublicationCheckpoint(input: PublicationCheckpointInput): Promise<PublicationOperationRecord>;
}
