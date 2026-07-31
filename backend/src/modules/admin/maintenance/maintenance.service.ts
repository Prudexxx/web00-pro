import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { AdminMutationContext } from "../admin.types.js";
import {
  reconcileCanonicalLegacyAssets,
  type CanonicalAssetReconciliationReport,
  type CanonicalAssetReconciliationRepository,
  type CanonicalAssetSourceCatalog
} from "../sites/canonical-asset-reconciliation.js";

export interface AdminMaintenanceService {
  apply(
    input: AdminCanonicalAssetsApplyInput,
    context: AdminMutationContext
  ): Promise<CanonicalAssetReconciliationReport>;
  dryRun(context: AdminMutationContext): Promise<CanonicalAssetReconciliationReport>;
}

export interface AdminCanonicalAssetsApplyInput {
  confirmation: string;
}

export interface AdminMaintenanceServiceOptions {
  readCatalog?: () => Promise<CanonicalAssetSourceCatalog>;
  repository: CanonicalAssetReconciliationRepository;
}

export function createAdminMaintenanceService(
  options: AdminMaintenanceServiceOptions
): AdminMaintenanceService {
  const readCatalog = options.readCatalog ?? readCanonicalAssetSourceCatalog;

  return {
    async apply(input, context) {
      return reconcileCanonicalLegacyAssets({
        apply: true,
        catalog: await readCatalog(),
        confirm: input.confirmation,
        context: toReconciliationContext(context),
        repository: options.repository
      });
    },
    async dryRun(context) {
      return reconcileCanonicalLegacyAssets({
        catalog: await readCatalog(),
        context: toReconciliationContext(context),
        repository: options.repository
      });
    }
  };
}

export async function readCanonicalAssetSourceCatalog(): Promise<CanonicalAssetSourceCatalog> {
  const file = path.join(process.cwd(), "prisma", "seed-data", "web00-catalog.json");
  const raw = await readFile(file, "utf8");

  return JSON.parse(raw) as CanonicalAssetSourceCatalog;
}

function toReconciliationContext(context: AdminMutationContext) {
  return {
    actorUserId: context.actor.id,
    ipHash: null,
    requestId: context.requestId,
    userAgentHash: null
  };
}
