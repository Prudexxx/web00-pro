import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import type { AuthEnv } from "./config/auth-env.js";
import { parseAuthEnv } from "./config/auth-env.js";
import type { RuntimeDatabaseEnv } from "./config/database-env.js";
import { parseRuntimeDatabaseEnv } from "./config/database-env.js";
import type { AppEnv } from "./config/env.js";
import { parseEnv } from "./config/env.js";
import type { ImageProcessingConfig } from "./config/image-processing-env.js";
import {
  defaultImageProcessingConfig,
  parseImageProcessingEnv,
  toImageProcessingConfig
} from "./config/image-processing-env.js";
import type { PublicCorsConfig } from "./config/public-cors-env.js";
import { parsePublicCorsEnv, toPublicCorsConfig } from "./config/public-cors-env.js";
import type { StorageConfig } from "./config/storage-env.js";
import { parseStorageEnv, toStorageConfig } from "./config/storage-env.js";
import { createPrismaClient } from "./db/prisma.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createLogger, type AppLogger } from "./lib/logger.js";
import { CATALOG_PUBLIC_ASSET_ORIGIN } from "./lib/catalog-asset-url.js";
import { createAccessTokenService } from "./modules/auth/access-token.service.js";
import { createAuthAuditService } from "./modules/auth/auth-audit.js";
import { createAuthCookieService } from "./modules/auth/auth-cookie.js";
import { createCredentialVerifier } from "./modules/auth/auth-credentials.service.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createArgon2PasswordHasher } from "./modules/auth/password.service.js";
import { createRefreshTokenService } from "./modules/auth/refresh-token.service.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createPrismaAdminAuditLogRepository } from "./modules/admin/audit/audit-log.repository.js";
import { createAdminAuditLogService } from "./modules/admin/audit/audit-log.service.js";
import { createPrismaAdminCategoryRepository } from "./modules/admin/categories/category.repository.js";
import { createAdminCategoryService } from "./modules/admin/categories/category.service.js";
import { createPrismaAdminPublicCatalogRepository } from "./modules/admin/public-catalog/public-catalog-admin.repository.js";
import { createAdminPublicCatalogService } from "./modules/admin/public-catalog/public-catalog-admin.service.js";
import { createPrismaAdminPublicationRepository } from "./modules/admin/publication/publication.repository.js";
import {
  createAdminPublicationService,
  createPagesCatalogPublicationService
} from "./modules/admin/publication/publication.service.js";
import { createGitHubPagesCatalogProviderFromEnv } from "./modules/admin/publication/pages-publication.github.js";
import { createPrismaAdminSiteRepository } from "./modules/admin/sites/site.repository.js";
import { createAdminSiteService } from "./modules/admin/sites/site.service.js";
import {
  createAdminMaintenanceService,
  readCanonicalAssetSourceCatalog
} from "./modules/admin/maintenance/maintenance.service.js";
import {
  createPrismaCanonicalAssetReconciliationRepository
} from "./modules/admin/sites/canonical-asset-reconciliation.repository.js";
import { createPrismaAdminUserRepository } from "./modules/admin/users/user.repository.js";
import { createAdminUserService } from "./modules/admin/users/user.service.js";
import { createSiteImageService } from "./modules/admin/images/site-image.service.js";
import { createPrismaSiteImageRepository } from "./modules/admin/images/site-image.repository.js";
import { createAdminUiRouter } from "./modules/admin-ui/admin-ui.routes.js";
import { createAssetUploadCoordinator } from "./modules/images/asset-upload-coordinator.js";
import { createManagedImageUrlPolicy } from "./modules/images/image-paths.js";
import { createSharpImageProcessor } from "./modules/images/image-processor.js";
import { createBusboyMultipartImageParser } from "./modules/images/multipart-image-parser.js";
import { createSupabaseImageStorage } from "./modules/images/supabase-image-storage.js";
import { createPrismaStorageCleanupRepository } from "./modules/storage-cleanup/storage-cleanup.repository.js";
import { createStorageCleanupWorker } from "./modules/storage-cleanup/storage-cleanup.worker.js";
import { createPrismaPublicCatalogRepository } from "./modules/public-catalog/public-catalog.repository.js";
import { createPublicCatalogService } from "./modules/public-catalog/public-catalog.service.js";
import { createPrismaPublicCatalogSyncRepository } from "./modules/public-catalog/public-catalog-control.repository.js";
import { createPublicCatalogDryRunService } from "./modules/public-catalog/public-catalog-dry-run.service.js";
import { createPublicCatalogStorageBucketManager } from "./modules/public-catalog/public-catalog-storage-bucket.js";
import { createPublicCatalogSnapshotStorage } from "./modules/public-catalog/public-catalog-snapshot-storage.js";
import { createPublicCatalogSyncService } from "./modules/public-catalog/public-catalog-sync.service.js";
import { createPublicCatalogV2Runtime, type PublicCatalogV2Runtime } from "./modules/public-catalog-v2/public-catalog-v2.runtime.js";
import { createPublicCatalogV2SupabaseStorage } from "./modules/public-catalog-v2/public-catalog-v2.supabase-storage.js";
import {
  createPrismaReadinessProbe,
  createReadinessService
} from "./modules/readiness/readiness.service.js";

export interface ShutdownHandlerOptions {
  disconnect?: () => Promise<void>;
  env: AppEnv;
  exit: (code: number) => void;
  logger: AppLogger;
  now?: () => Date;
  signal: NodeJS.Signals;
  timeoutMs?: number;
}

export interface StartServerOptions {
  authEnv: AuthEnv;
  createPrisma?: typeof createPrismaClient;
  databaseEnv: RuntimeDatabaseEnv;
  env: AppEnv;
  imageProcessingConfig?: ImageProcessingConfig;
  logger?: AppLogger;
  now?: () => Date;
  publicCorsConfig: PublicCorsConfig;
  publicCatalogV2Runtime?: PublicCatalogV2Runtime;
  publicCatalogV2WorkerEnabled?: boolean;
  registerSignalHandlers?: boolean;
  storageConfig: StorageConfig;
}

export interface StartedServer {
  prisma: PrismaClient;
  publicCatalogV2Runtime?: PublicCatalogV2Runtime;
  server: Server;
}

export function startServer(options: StartServerOptions): StartedServer {
  const logger = options.logger ?? createLogger({ env: options.env });
  const imageProcessingConfig =
    options.imageProcessingConfig ?? defaultImageProcessingConfig;
  const createPrisma = options.createPrisma ?? createPrismaClient;
  const prisma = createPrisma({
    databaseUrl: options.databaseEnv.DATABASE_URL
  });
  const readinessService = createReadinessService({
    probe: createPrismaReadinessProbe(prisma)
  });
  const imageUrlPolicy = createManagedImageUrlPolicy({
    bucket: options.storageConfig.bucket,
    publicBaseUrl: options.storageConfig.publicBaseUrl
  });
  const imageStorage = createSupabaseImageStorage(options.storageConfig);
  const publicCatalogSnapshotStorage = createPublicCatalogSnapshotStorage(
    options.storageConfig,
    { logger }
  );
  const publicCatalogStorageBucket = createPublicCatalogStorageBucketManager(
    options.storageConfig,
    { logger }
  );
  const storageCleanupRepository = createPrismaStorageCleanupRepository({ prisma });
  const storageCleanupWorker = createStorageCleanupWorker({
    clock: { now: options.now ?? (() => new Date()) },
    repository: storageCleanupRepository,
    storage: imageStorage
  });
  const publicCatalogV2Runtime =
    options.publicCatalogV2WorkerEnabled === true
      ? options.publicCatalogV2Runtime ?? createPublicCatalogV2Runtime({
          enabled: true,
          now: options.now ?? (() => new Date()),
          prisma,
          storage: createPublicCatalogV2SupabaseStorage(options.storageConfig)
        })
      : undefined;
  const repository = createPrismaPublicCatalogRepository({ prisma });
  const publicCatalogService = createPublicCatalogService({
    imageUrlPolicy,
    repository
  });
  const publicCatalogSyncService = createPublicCatalogSyncService({
    bucketManager: publicCatalogStorageBucket,
    cleanup: storageCleanupRepository,
    logger,
    now: options.now ?? (() => new Date()),
    repository: createPrismaPublicCatalogSyncRepository({ prisma }),
    storage: publicCatalogSnapshotStorage
  });
  const publicCatalogDryRunService = createPublicCatalogDryRunService({
    logger,
    now: options.now ?? (() => new Date()),
    prisma
  });
  const authRepository = createAuthRepository({ prisma });
  const authService = createAuthService({
    accessTokenTtlSeconds: options.authEnv.ACCESS_TOKEN_TTL_SECONDS,
    accessTokens: createAccessTokenService({
      audience: options.authEnv.JWT_AUDIENCE,
      issuer: options.authEnv.JWT_ISSUER,
      secret: options.authEnv.JWT_ACCESS_SECRET,
      ttlSeconds: options.authEnv.ACCESS_TOKEN_TTL_SECONDS
    }),
    audit: createAuthAuditService({
      fingerprintSecret: options.authEnv.AUTH_FINGERPRINT_SECRET
    }),
    clock: options.now ?? (() => new Date()),
    credentials: createCredentialVerifier({
      hasher: createArgon2PasswordHasher(),
      repository: authRepository
    }),
    environment: options.env.NODE_ENV,
    logger,
    randomUUID,
    refreshTokenTtlSeconds: options.authEnv.REFRESH_TOKEN_TTL_SECONDS,
    refreshTokens: createRefreshTokenService(),
    repository: authRepository,
    serviceName: options.env.SERVICE_NAME
  });
  const authRoutes = createAuthRouter({
    authEnv: options.authEnv,
    cookies: createAuthCookieService({ nodeEnv: options.env.NODE_ENV }),
    nodeEnv: options.env.NODE_ENV,
    service: authService
  });
  const adminRouterOptions = {
    auditLogService: createAdminAuditLogService({
      repository: createPrismaAdminAuditLogRepository({ prisma })
    }),
    authService,
    categoryService: createAdminCategoryService({
      repository: createPrismaAdminCategoryRepository({ prisma })
    }),
    siteService: createAdminSiteService({
      repository: createPrismaAdminSiteRepository({
        diagnostics: {
          environment: options.env.NODE_ENV,
          logger,
          now: options.now ?? (() => new Date()),
          service: options.env.SERVICE_NAME
        },
        prisma
      })
    }),
    imageParser: createBusboyMultipartImageParser(),
    imageService: createSiteImageService({
      cleanup: storageCleanupRepository,
      coordinator: createAssetUploadCoordinator(),
      diagnostics: {
        environment: options.env.NODE_ENV,
        logger,
        now: options.now ?? (() => new Date()),
        service: options.env.SERVICE_NAME
      },
      imageUrlPolicy,
      processor: createSharpImageProcessor({
        maxConcurrency: imageProcessingConfig.maxConcurrency,
        maxPixels: imageProcessingConfig.maxPixels,
        maxQueued: imageProcessingConfig.maxQueued,
        queueWaitTimeoutMs: imageProcessingConfig.queueWaitTimeoutMs,
        timeoutMs: imageProcessingConfig.timeoutMs
      }),
      repository: createPrismaSiteImageRepository({ prisma }),
      storage: imageStorage
    }),
    maintenanceService: createAdminMaintenanceService({
      readCatalog: readCanonicalAssetSourceCatalog,
      repository: createPrismaCanonicalAssetReconciliationRepository({ prisma })
    }),
    publicationEnabled: publicCatalogV2Runtime !== undefined,
    publicationService: createAdminPublicationService({
      repository: createPrismaAdminPublicationRepository({ prisma })
    }),
    pagesPublicationService: createPagesCatalogPublicationService({
      allowedMediaOrigin: new URL(options.storageConfig.publicBaseUrl).origin,
      github: createGitHubPagesCatalogProviderFromEnv(process.env),
      now: options.now ?? (() => new Date())
    }),
    publicCatalogService: createAdminPublicCatalogService({
      dryRunService: publicCatalogDryRunService,
      repository: createPrismaAdminPublicCatalogRepository({ prisma }),
      syncService: publicCatalogSyncService
    }),
    userService: createAdminUserService({
      repository: createPrismaAdminUserRepository({ prisma })
    })
  };
  const adminRoutes = createAdminRouter(
    options.now === undefined
      ? adminRouterOptions
      : { ...adminRouterOptions, now: options.now }
  );
  const adminUiRoutes = createAdminUiRouter({
    catalogPublicOrigin: CATALOG_PUBLIC_ASSET_ORIGIN,
    nodeEnv: options.env.NODE_ENV,
    storagePublicOrigin: new URL(options.storageConfig.publicBaseUrl).origin
  });
  const createAppOptions = {
    adminRoutes,
    adminUiRoutes,
    authRoutes,
    env: options.env,
    logger,
    publicCorsConfig: options.publicCorsConfig,
    publicCatalogService,
    readinessService,
    trustProxyHops: options.authEnv.TRUST_PROXY_HOPS,
    versionInfo: readRuntimeVersionInfo(process.env)
  };
  const app = createApp(
    options.now === undefined
      ? createAppOptions
      : { ...createAppOptions, now: options.now }
  );
  const server = createServer(app);

  if (options.storageConfig.workerEnabled) {
    storageCleanupWorker.start();
  }
  publicCatalogV2Runtime?.start();

  server.listen(options.env.PORT, "0.0.0.0", () => {
    logLifecycle({
      env: options.env,
      event: "server_started",
      logger,
      now: options.now ?? (() => new Date())
    });
  });

  if (options.registerSignalHandlers ?? true) {
    process.once(
      "SIGTERM",
      createShutdownHandler(server, {
        disconnect: async () => {
          await Promise.all([
            publicCatalogV2Runtime?.stop(),
            storageCleanupWorker.stop()
          ]);
          await prisma.$disconnect();
        },
        env: options.env,
        exit: (code) => process.exit(code),
        logger,
        signal: "SIGTERM"
      })
    );
    process.once(
      "SIGINT",
      createShutdownHandler(server, {
        disconnect: async () => {
          await Promise.all([
            publicCatalogV2Runtime?.stop(),
            storageCleanupWorker.stop()
          ]);
          await prisma.$disconnect();
        },
        env: options.env,
        exit: (code) => process.exit(code),
        logger,
        signal: "SIGINT"
      })
    );
  }

  return {
    prisma,
    ...(publicCatalogV2Runtime === undefined ? {} : { publicCatalogV2Runtime }),
    server
  };
}

export function createShutdownHandler(
  server: Server,
  options: ShutdownHandlerOptions
): () => void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());
  let shutdownStarted = false;

  return () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logLifecycle({
      env: options.env,
      event: `${options.signal}_received`,
      logger: options.logger,
      now
    });

    const forcedTimeout = setTimeout(() => {
      logLifecycle({
        env: options.env,
        event: "server_shutdown_forced",
        level: "error",
        logger: options.logger,
        now
      });
      options.exit(1);
    }, timeoutMs);

    server.close((error?: Error) => {
      void handleServerClosed(error, options, now)
        .finally(() => {
          clearTimeout(forcedTimeout);
        });
    });
  };
}

async function handleServerClosed(
  error: Error | undefined,
  options: ShutdownHandlerOptions,
  now: () => Date
): Promise<void> {
  try {
    await options.disconnect?.();
  } catch {
    logLifecycle({
      env: options.env,
      event: "server_shutdown_failed",
      level: "error",
      logger: options.logger,
      now
    });
    options.exit(1);
    return;
  }

  if (error) {
    logLifecycle({
      env: options.env,
      event: "server_shutdown_failed",
      level: "error",
      logger: options.logger,
      now
    });
    options.exit(1);
    return;
  }

  logLifecycle({
    env: options.env,
    event: "server_shutdown_complete",
    logger: options.logger,
    now
  });
}

export function main(): StartedServer {
  const env = parseEnv(process.env);
  const databaseEnv = parseRuntimeDatabaseEnv(process.env);
  const authEnv = parseAuthEnv(process.env, { nodeEnv: env.NODE_ENV });
  const publicCorsConfig = toPublicCorsConfig(
    parsePublicCorsEnv(process.env, { nodeEnv: env.NODE_ENV })
  );
  const storageConfig = toStorageConfig(parseStorageEnv(process.env));
  const imageProcessingConfig = toImageProcessingConfig(
    parseImageProcessingEnv(process.env)
  );

  return startServer({
    authEnv,
    databaseEnv,
    env,
    imageProcessingConfig,
    publicCorsConfig,
    publicCatalogV2WorkerEnabled: readPublicCatalogV2WorkerEnabled(process.env),
    storageConfig
  });
}

if (isDirectRun()) {
  main();
}

interface LifecycleLogOptions {
  env: AppEnv;
  event: string;
  level?: "info" | "error";
  logger: AppLogger;
  now: () => Date;
}

function logLifecycle(options: LifecycleLogOptions): void {
  options.logger.log({
    environment: options.env.NODE_ENV,
    event: options.event,
    level: options.level ?? "info",
    service: options.env.SERVICE_NAME,
    time: options.now().toISOString()
  });
}

function readRuntimeVersionInfo(env: NodeJS.ProcessEnv): {
  branch: string | null;
  commit: string | null;
  version: string | null;
} {
  return {
    branch: env.RENDER_GIT_BRANCH ?? null,
    commit: env.RENDER_GIT_COMMIT ?? null,
    version: env.npm_package_version ?? null
  };
}

export function readPublicCatalogV2WorkerEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.PUBLIC_CATALOG_V2_WORKER_ENABLED === "true";
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
