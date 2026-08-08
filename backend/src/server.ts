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
import {
  defaultImageProcessingConfig,
  parseImageProcessingEnv,
  toImageProcessingConfig,
  type ImageProcessingConfig
} from "./config/image-processing-env.js";
import {
  parseCloudRuRuntimeEnv,
  type CloudRuRuntimeEnvConfig
} from "./config/cloudru-runtime-env.js";
import type { PublicCorsConfig } from "./config/public-cors-env.js";
import { parsePublicCorsEnv, toPublicCorsConfig } from "./config/public-cors-env.js";
import type { StorageConfig } from "./config/storage-env.js";
import { parseStorageEnv, toStorageConfig } from "./config/storage-env.js";
import { createPrismaClient } from "./db/prisma.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createLogger, type AppLogger } from "./lib/logger.js";
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
import {
  createAdminPublicationService,
  createPagesCatalogPublicationReconciliationWorker,
  createPagesCatalogPublicationService
} from "./modules/admin/publication/publication.service.js";
import { createGitHubPagesCatalogProviderFromEnv } from "./modules/admin/publication/pages-publication.github.js";
import { createPrismaAdminSiteRepository } from "./modules/admin/sites/site.repository.js";
import { createAdminSiteService } from "./modules/admin/sites/site.service.js";
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
import { createPublicCatalogReconciler } from "./modules/public-catalog/public-catalog-reconciler.js";
import { createPublicRuntimePrimaryDependencies } from "./modules/public-catalog/public-runtime-primary.js";
import { createPublicRuntimeShadowDependencies } from "./modules/public-catalog/public-runtime-shadow.js";
import {
  createPrismaReadinessProbe,
  createReadinessService
} from "./modules/readiness/readiness.service.js";
import type { AuthenticatedPrincipal } from "./modules/auth/auth.types.js";

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
  publicRuntimeShadowEnv?: CloudRuRuntimeEnvConfig;
  registerSignalHandlers?: boolean;
  storageConfig: StorageConfig;
}

export interface StartedServer {
  prisma: PrismaClient;
  server: Server;
}

const DIRECT_PAGES_SYSTEM_ACTOR: AuthenticatedPrincipal = {
  email: "system@web00.local",
  id: "00000000-0000-4000-8000-000000000901",
  role: "admin",
  sessionId: "00000000-0000-4000-8000-000000000902",
  tokenId: "00000000-0000-4000-8000-000000000903"
};

export function startServer(options: StartServerOptions): StartedServer {
  const logger = options.logger ?? createLogger({ env: options.env });
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
  const imageProcessingConfig =
    options.imageProcessingConfig ?? defaultImageProcessingConfig;
  const imageStorage = createSupabaseImageStorage(options.storageConfig);
  const storageCleanupRepository = createPrismaStorageCleanupRepository({ prisma });
  const storageCleanupWorker = createStorageCleanupWorker({
    clock: { now: options.now ?? (() => new Date()) },
    repository: storageCleanupRepository,
    storage: imageStorage
  });
  const repository = createPrismaPublicCatalogRepository({ prisma });
  const publicCatalogService = createPublicCatalogService({
    imageUrlPolicy,
    repository
  });
  const publicRuntimeShadow = createPublicRuntimeShadowDependencies({
    env: options.publicRuntimeShadowEnv ?? {
      primary: { enabled: false },
      shadow: { enabled: false }
    },
    now: options.now ?? (() => new Date()),
    prisma
  });
  const publicRuntimePrimary = createPublicRuntimePrimaryDependencies({
    env: (options.publicRuntimeShadowEnv ?? {
      primary: { enabled: false },
      shadow: { enabled: false }
    }).primary,
    now: options.now ?? (() => new Date()),
    prisma
  });
  const publicCatalogReconciler = publicRuntimePrimary === null
    ? null
    : createPublicCatalogReconciler({
        onError: () => {
          logger.log({
            environment: options.env.NODE_ENV,
            event: "public-catalog.reconcile.failed",
            level: "error",
            service: options.env.SERVICE_NAME,
            time: (options.now ?? (() => new Date()))().toISOString()
          });
        },
        syncService: publicRuntimePrimary.syncService
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
  const adminSiteService = createAdminSiteService({
    ...(publicCatalogReconciler === null ? {} : { publicCatalogReconciler }),
    repository: createPrismaAdminSiteRepository({
      diagnostics: {
        environment: options.env.NODE_ENV,
        logger,
        now: options.now ?? (() => new Date()),
        service: options.env.SERVICE_NAME
      },
      prisma
    })
  });
  const pagesPublicationService = createPagesCatalogPublicationService({
    allowedMediaOrigin: new URL(options.storageConfig.publicBaseUrl).origin,
    github: createGitHubPagesCatalogProviderFromEnv(process.env),
    lifecycleFinalizer: {
      async finalize(input) {
        const context = {
          actor: input.actor,
          now: input.now,
          requestId: input.requestId
        };
        const current = await adminSiteService.getSite(input.siteId, input.actor);

        if (input.lifecycleAction === "delete") {
          if (typeof current.deletedAt === "string" && current.deletedAt.length > 0) {
            return;
          }
          await adminSiteService.deleteSite(input.siteId, context);
          return;
        }
        if (input.lifecycleAction === "unpublish") {
          if (current.status === "draft" && current.publishedAt === null) {
            return;
          }
          await adminSiteService.unpublishSite(input.siteId, context);
          return;
        }
        if (current.status === "published" && current.publishedAt !== null && current.deletedAt === null) {
          return;
        }
        await adminSiteService.publishSite(input.siteId, context);
      }
    },
    now: options.now ?? (() => new Date())
  });
  const pagesPublicationReconciliationWorker = createPagesCatalogPublicationReconciliationWorker({
    actor: DIRECT_PAGES_SYSTEM_ACTOR,
    now: options.now ?? (() => new Date()),
    onError: () => {
      logger.log({
        environment: options.env.NODE_ENV,
        event: "admin.pages-publication.reconciliation.failed",
        level: "error",
        service: options.env.SERVICE_NAME,
        time: (options.now ?? (() => new Date()))().toISOString()
      });
    },
    service: pagesPublicationService
  });
  const adminRouterOptions = {
    auditLogService: createAdminAuditLogService({
      repository: createPrismaAdminAuditLogRepository({ prisma })
    }),
    authService,
    categoryService: createAdminCategoryService({
      ...(publicCatalogReconciler === null ? {} : { publicCatalogReconciler }),
      repository: createPrismaAdminCategoryRepository({ prisma })
    }),
    siteService: adminSiteService,
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
      ...(publicCatalogReconciler === null ? {} : { publicCatalogReconciler }),
      repository: createPrismaSiteImageRepository({ prisma }),
      storage: imageStorage
    }),
    pagesPublicationService,
    publicationService: createAdminPublicationService(),
    ...(publicRuntimeShadow === null ? {} : { publicRuntimeShadow }),
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
    trustProxyHops: options.authEnv.TRUST_PROXY_HOPS
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
  publicCatalogReconciler?.start();
  pagesPublicationReconciliationWorker.start();

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
            publicCatalogReconciler?.stop() ?? Promise.resolve(),
            pagesPublicationReconciliationWorker.stop(),
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
            publicCatalogReconciler?.stop() ?? Promise.resolve(),
            pagesPublicationReconciliationWorker.stop(),
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

  return { prisma, server };
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
      clearTimeout(forcedTimeout);

      void handleServerClosed(error, options, now);
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
  const publicRuntimeShadowEnv = parseCloudRuRuntimeEnv(process.env);
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
    publicRuntimeShadowEnv,
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

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
