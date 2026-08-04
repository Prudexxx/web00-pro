import { AppError } from "../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { PublicCatalogV2RepositoryError } from "./public-catalog-v2.repository.js";
import { stableSerializeJson } from "./public-catalog-v2.serializer.js";
import type {
  CreatePublicationOperationInput,
  PublicationOperationRecord,
  PublicCatalogV2OperationStatus,
  PublicCatalogV2Repository
} from "./public-catalog-v2.types.js";

const PUBLICATION_OPERATION_GROUP_KEY = "public-catalog";
const PUBLICATION_TRIGGER = "site_publication";
const DEFAULT_PUBLICATION_STAGE = "content_transaction";

export type PublicationUserStableStatus =
  | "Публикуется"
  | "Опубликовано"
  | "Ошибка публикации"
  | "Не опубликовано";

export interface PublicationOperationDto {
  buttonLabel: string;
  operationId: string;
  retryable: boolean;
  stableStatus: PublicationUserStableStatus;
  status: PublicCatalogV2OperationStatus;
  statusUrl: string;
}

export interface DurablePublicationInput {
  action: "publish" | "unpublish";
  actor: AuthenticatedPrincipal;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
  targetRevision: number;
}

export interface DurablePublicationOperationService {
  startPublication(input: DurablePublicationInput): Promise<PublicationOperationDto>;
}

export class PublicCatalogV2PublicationError extends Error {
  constructor(readonly code: "PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH") {
    super(code);
    this.name = "PublicCatalogV2PublicationError";
  }
}

export function createDurablePublicationOperationService(options: {
  now?: () => Date;
  repository: Pick<PublicCatalogV2Repository, "createOrCoalescePublicationOperation">;
}): DurablePublicationOperationService {
  return {
    async startPublication(input) {
      try {
        const operation = await options.repository.createOrCoalescePublicationOperation(
          toCreatePublicationOperationInput(input)
        );

        return mapPublicationOperationToDto(operation);
      } catch (error) {
        throw toPublicationAppError(error);
      }
    }
  };
}

export function mapPublicationOperationToDto(operation: PublicationOperationRecord): PublicationOperationDto {
  const status = readPublicationOperationStatus(operation.status);
  const action = readPublicationOperationAction(operation.action);
  const mapping = mapStatusToUserState(status, action);

  return {
    buttonLabel: mapping.buttonLabel,
    operationId: operation.id,
    retryable: mapping.retryable,
    stableStatus: mapping.stableStatus,
    status,
    statusUrl: buildPublicationOperationStatusUrl(operation.id)
  };
}

export async function finalizePublicationSuccess(input: {
  activePointer: Record<string, unknown>;
  dependencies: {
    assertPublicCardParity(input: Record<string, unknown>): Promise<unknown>;
    finalizePublicationTransaction(input: Record<string, unknown>): Promise<unknown>;
    readActivePointer(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    readDbContentState(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    readImmutableRelease(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  leaseId: string;
  now: () => Date;
  operation: PublicationOperationRecord;
  release: Record<string, unknown>;
}): Promise<PublicationOperationDto & {
  activePointerReadBack: "verified";
  dbFinalized: true;
  immutableReleaseVerified: true;
  publicCardParity: "verified";
}> {
  const action = readPublicationOperationAction(input.operation.action);
  const expectedRevision = readNumber(input.release.activationInput, "revision");
  if (expectedRevision !== input.operation.targetRevision) {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }
  const expectedManifestPath = readString(input.release.activationInput, "manifestPath");
  const expectedManifestSha256 = readString(input.release.activationInput, "manifestSha256");
  const expectedActivePointerSha256 = readString(input.activePointer, "sha256");

  const dbContentState = await input.dependencies.readDbContentState({
    operationId: input.operation.id,
    siteId: input.operation.siteId
  });
  const activePointer = await input.dependencies.readActivePointer({
    expectedRevision,
    operationId: input.operation.id,
    path: readString(input.activePointer, "path")
  });

  assertActivePointerMatches({
    activePointer,
    expectedActivePointerSha256,
    expectedManifestPath,
    expectedManifestSha256,
    expectedRevision
  });
  const previousRevision = readOptionalRevision(activePointer, "previousRevision");

  const immutableRelease = await input.dependencies.readImmutableRelease({
    manifestPath: expectedManifestPath,
    operationId: input.operation.id,
    revision: expectedRevision
  });
  assertImmutableReleaseMatches({
    expectedRevision,
    immutableRelease,
    release: input.release
  });

  await input.dependencies.assertPublicCardParity({
    activePointer,
    dbContentState,
    expectedPresence: action === "unpublish" ? "absent" : "present",
    immutableRelease,
    operation: input.operation,
    release: input.release
  });
  await input.dependencies.finalizePublicationTransaction({
    activePointerSha256: readString(activePointer, "sha256"),
    action,
    completedAt: input.now(),
    eventType: "activate",
    expectedPublicState: action === "unpublish" ? "unpublished" : "published",
    leaseId: input.leaseId,
    operationId: input.operation.id,
    previousRevision,
    requestId: input.operation.requestId,
    revision: expectedRevision,
    siteId: input.operation.siteId
  });

  return {
    activePointerReadBack: "verified",
    dbFinalized: true,
    immutableReleaseVerified: true,
    publicCardParity: "verified",
    ...mapTerminalSuccessToDto(input.operation)
  };
}

export function toPublicationAppError(error: unknown): unknown {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof PublicCatalogV2RepositoryError && error.code === "IDEMPOTENCY_KEY_REUSED") {
    return new AppError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency key was already used for a different publication request.",
      statusCode: 409
    });
  }

  return error;
}

function toCreatePublicationOperationInput(input: DurablePublicationInput): CreatePublicationOperationInput {
  return {
    action: input.action,
    actorUserId: input.actor.id,
    idempotencyKey: input.idempotencyKey,
    operationGroupKey: PUBLICATION_OPERATION_GROUP_KEY,
    operationScope: `site:${input.siteId}`,
    projectionHash: null,
    requestFingerprint: input.requestFingerprint,
    requestId: input.requestId,
    siteId: input.siteId,
    stage: DEFAULT_PUBLICATION_STAGE,
    targetRevision: input.targetRevision,
    trigger: PUBLICATION_TRIGGER
  };
}

function buildPublicationOperationStatusUrl(operationId: string): string {
  return `/api/admin/public-catalog/operations/${operationId}`;
}

function mapTerminalSuccessToDto(operation: PublicationOperationRecord): PublicationOperationDto {
  return mapPublicationOperationToDto({
    ...operation,
    status: "succeeded"
  });
}

function mapStatusToUserState(
  status: PublicCatalogV2OperationStatus,
  action: PublicCatalogV2PublicationAction
): {
  buttonLabel: string;
  retryable: boolean;
  stableStatus: PublicationUserStableStatus;
} {
  switch (status) {
    case "queued":
    case "running":
    case "retry_wait":
      return {
        buttonLabel: "Публикуется…",
        retryable: false,
        stableStatus: "Публикуется"
      };
    case "succeeded":
      if (action === "unpublish") {
        return {
          buttonLabel: "Опубликовать",
          retryable: false,
          stableStatus: "Не опубликовано"
        };
      }

      return {
        buttonLabel: "Опубликовано",
        retryable: false,
        stableStatus: "Опубликовано"
      };
    case "failed":
      return {
        buttonLabel: "Повторить публикацию",
        retryable: true,
        stableStatus: "Ошибка публикации"
      };
    case "cancelled":
      return {
        buttonLabel: "Опубликовать",
        retryable: true,
        stableStatus: "Не опубликовано"
      };
  }
}

type PublicCatalogV2PublicationAction = "publish" | "unpublish" | "settings_publish" | "reconcile";

function readPublicationOperationAction(value: string): PublicCatalogV2PublicationAction {
  if (value === "publish" || value === "unpublish" || value === "settings_publish" || value === "reconcile") {
    return value;
  }

  throw new Error("PUBLIC_CATALOG_V2_UNKNOWN_OPERATION_ACTION");
}

function readPublicationOperationStatus(value: string): PublicCatalogV2OperationStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "retry_wait" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new Error("PUBLIC_CATALOG_V2_UNKNOWN_OPERATION_STATUS");
}

function assertActivePointerMatches(input: {
  activePointer: Record<string, unknown>;
  expectedActivePointerSha256: string;
  expectedManifestPath: string;
  expectedManifestSha256: string;
  expectedRevision: number;
}): void {
  if (
    readNumber(input.activePointer, "revision") !== input.expectedRevision ||
    readString(input.activePointer, "manifestPath") !== input.expectedManifestPath ||
    readString(input.activePointer, "manifestSha256") !== input.expectedManifestSha256 ||
    readString(input.activePointer, "sha256") !== input.expectedActivePointerSha256
  ) {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }
}

function assertImmutableReleaseMatches(input: {
  expectedRevision: number;
  immutableRelease: Record<string, unknown>;
  release: Record<string, unknown>;
}): void {
  const expectedManifestPath = readString(input.release.activationInput, "manifestPath");
  const expectedManifestSha256 = readString(input.release.activationInput, "manifestSha256");
  const expectedManifest = readRecord(input.release.manifest);

  if (
    readNumber(input.immutableRelease, "revision") !== input.expectedRevision ||
    readString(input.immutableRelease, "manifestPath") !== expectedManifestPath ||
    readString(input.immutableRelease, "manifestSha256") !== expectedManifestSha256 ||
    readString(input.immutableRelease, "sha256") !== expectedManifestSha256 ||
    readNumber(input.immutableRelease, "itemsCount") !== readNumber(expectedManifest, "itemsCount") ||
    !stableJsonEqualsWhenExpected(input.immutableRelease.artifacts, expectedManifest.artifacts) ||
    !stableJsonEqualsWhenExpected(input.immutableRelease.chunks, expectedManifest.chunks) ||
    !stableJsonEqualsWhenExpected(input.immutableRelease.index, expectedManifest.index)
  ) {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }
}

function stableJsonEqualsWhenExpected(left: unknown, right: unknown): boolean {
  if (right === undefined) {
    return true;
  }

  try {
    return stableSerializeJson(left) === stableSerializeJson(right);
  } catch {
    return false;
  }
}

function readString(parent: unknown, key: string): string {
  const record = readRecord(parent);
  const value = record[key];
  if (typeof value !== "string") {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }

  return value;
}

function readNumber(parent: unknown, key: string): number {
  const record = readRecord(parent);
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }

  return value;
}

function readOptionalRevision(parent: unknown, key: string): number | null {
  const record = readRecord(parent);
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PublicCatalogV2PublicationError("PUBLIC_CATALOG_V2_ACTIVE_POINTER_MISMATCH");
  }

  return value as Record<string, unknown>;
}
