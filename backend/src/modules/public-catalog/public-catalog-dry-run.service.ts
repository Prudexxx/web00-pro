import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, type ErrorCode } from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  resolvePublicCatalogAnalysisRevision
} from "./public-catalog-control.repository.js";
import {
  mapUnexpectedPublicCatalogDryRunFailure,
  safePublicCatalogDryRunErrorClass
} from "./public-catalog-dry-run.diagnostics.js";
import {
  createPrismaPublicCatalogDryRunRepository
} from "./public-catalog-dry-run.repository.js";
import type {
  PublicCatalogDryRunResult,
  PublicCatalogDryRunStage
} from "./public-catalog-dry-run.types.js";
import {
  PublicCatalogSnapshotPreparationSystemError,
  preparePublicCatalogSnapshotCandidate
} from "./public-catalog-snapshot-preparation.js";
import {
  withPublicCatalogReadOnlyTransaction
} from "./public-catalog-readonly-transaction.js";

export interface PublicCatalogDryRunService {
  dryRun(input: { requestId: string }): Promise<PublicCatalogDryRunResult>;
}

export interface PublicCatalogDryRunServiceOptions {
  logger?: Pick<AppLogger, "log">;
  now?: () => Date;
  prepareSnapshotCandidate?: typeof preparePublicCatalogSnapshotCandidate;
  prisma: PrismaClient;
  repositoryFactory?: typeof createPrismaPublicCatalogDryRunRepository;
  runReadOnlyTransaction?: typeof withPublicCatalogReadOnlyTransaction;
}

export function createPublicCatalogDryRunService(
  options: PublicCatalogDryRunServiceOptions
): PublicCatalogDryRunService {
  const now = options.now ?? (() => new Date());
  const prepareSnapshotCandidate =
    options.prepareSnapshotCandidate ?? preparePublicCatalogSnapshotCandidate;
  const repositoryFactory =
    options.repositoryFactory ?? createPrismaPublicCatalogDryRunRepository;
  const runReadOnlyTransaction =
    options.runReadOnlyTransaction ?? withPublicCatalogReadOnlyTransaction;
  let active = false;

  return {
    async dryRun(input) {
      if (active) {
        throw new AppError({
          code: "PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS",
          message: "Public catalog dry-run is already in progress.",
          statusCode: 409
        });
      }

      active = true;
      const startedAt = Date.now();
      let revision: number | null = null;
      let stage: PublicCatalogDryRunStage = "control_load";

      try {
        const prepared = await runReadOnlyTransaction(options.prisma, async (tx) => {
          const repository = repositoryFactory({ tx });
          stage = "control_load";
          const control = await repository.readControlState();
          revision = resolvePublicCatalogAnalysisRevision(control);
          stage = "settings_load";
          const settings = await repository.readSettings();
          stage = "projection_load";
          const records = await repository.listSnapshotSites();
          stage = "item_map";

          const preparationInput = {
            generatedAt: now(),
            records,
            revision,
            settings
          };

          return prepareSnapshotCandidate(preparationInput);
        });
        const durationMs = Math.max(0, Date.now() - startedAt);
        const result: PublicCatalogDryRunResult =
          prepared.status === "ready"
            ? {
                blockers: [],
                blockersTruncated: false,
                byteLength: prepared.byteLength,
                durationMs,
                itemsCount: prepared.itemsCount,
                requestId: input.requestId,
                revision: prepared.revision,
                sha256: prepared.built.sha256,
                status: "ready"
              }
            : {
                blockers: prepared.blockers,
                blockersTruncated: prepared.blockersTruncated,
                byteLength: null,
                durationMs,
                itemsCount: prepared.itemsCount,
                requestId: input.requestId,
                revision: prepared.revision,
                sha256: null,
                status: "blocked"
              };

        logCompleted({
          logger: options.logger,
          result
        });

        return result;
      } catch (error) {
        const appError = mapUnexpectedPublicCatalogDryRunFailure(error);
        logFailed({
          durationMs: Math.max(0, Date.now() - startedAt),
          error,
          errorCode: appError.code,
          logger: options.logger,
          requestId: input.requestId,
          revision,
          stage:
            error instanceof PublicCatalogSnapshotPreparationSystemError
              ? error.stage
              : stage
        });
        throw appError;
      } finally {
        active = false;
      }
    }
  };
}

function logCompleted(input: {
  logger: Pick<AppLogger, "log"> | undefined;
  result: PublicCatalogDryRunResult;
}): void {
  try {
    input.logger?.log({
      blockersCount: input.result.blockers.length,
      byteLength: input.result.byteLength,
      durationMs: input.result.durationMs,
      event: "public_catalog_dry_run_completed",
      itemsCount: input.result.itemsCount,
      requestId: input.result.requestId,
      revision: input.result.revision,
      sha256: input.result.sha256,
      status: input.result.status
    });
  } catch {
    // Diagnostics must never replace the dry-run result.
  }
}

function logFailed(input: {
  durationMs: number;
  error: unknown;
  errorCode: ErrorCode;
  logger: Pick<AppLogger, "log"> | undefined;
  requestId: string;
  revision: number | null;
  stage: PublicCatalogDryRunStage;
}): void {
  try {
    input.logger?.log({
      durationMs: input.durationMs,
      errorClass: safePublicCatalogDryRunErrorClass(input.error),
      errorCode: input.errorCode,
      event: "public_catalog_dry_run_failed",
      requestId: input.requestId,
      revision: input.revision,
      stage: input.stage
    });
  } catch {
    // Diagnostics must never replace the dry-run failure.
  }
}
