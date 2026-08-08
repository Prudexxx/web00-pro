import type { CloudRuRuntimeTargetEnvConfig } from "../../config/cloudru-runtime-env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createCloudRuS3PublicRuntimeStorage } from "./cloudru-s3-public-runtime-storage.js";
import { createPrismaPublicCatalogSyncRepository } from "./public-catalog-control.repository.js";
import {
  createPublicCatalogSyncService,
  type PublicCatalogSyncService
} from "./public-catalog-sync.service.js";
import type { PublicRuntimeStorage } from "./public-runtime-storage.js";

export interface PublicRuntimePrimaryDependencies {
  storage: PublicRuntimeStorage;
  syncService: PublicCatalogSyncService;
  targetKey: string;
}

export function createPublicRuntimePrimaryDependencies(options: {
  createStorage?: (config: CloudRuRuntimeTargetEnvConfig & { enabled: true }) => PublicRuntimeStorage;
  env: CloudRuRuntimeTargetEnvConfig;
  now?: () => Date;
  prisma: PrismaClient;
}): PublicRuntimePrimaryDependencies | null {
  if (!options.env.enabled) {
    return null;
  }

  const storage = options.createStorage === undefined
    ? createCloudRuS3PublicRuntimeStorage({ config: options.env.storage })
    : options.createStorage(options.env);
  const repository = createPrismaPublicCatalogSyncRepository({ prisma: options.prisma });

  return {
    storage,
    syncService: createPublicCatalogSyncService({
      ...(options.now === undefined ? {} : { now: options.now }),
      pathPrefix: options.env.storage.prefix,
      repository,
      storage,
      target: options.env.target
    }),
    targetKey: options.env.targetKey
  };
}
