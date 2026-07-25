import { createServer, type Server } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import type { DatabaseEnv } from "./config/database-env.js";
import { parseDatabaseEnv } from "./config/database-env.js";
import type { AppEnv } from "./config/env.js";
import { parseEnv } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createLogger, type AppLogger } from "./lib/logger.js";
import { createPrismaPublicCatalogRepository } from "./modules/public-catalog/public-catalog.repository.js";
import { createPublicCatalogService } from "./modules/public-catalog/public-catalog.service.js";

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
  createPrisma?: typeof createPrismaClient;
  databaseEnv: DatabaseEnv;
  env: AppEnv;
  logger?: AppLogger;
  now?: () => Date;
  registerSignalHandlers?: boolean;
}

export interface StartedServer {
  prisma: PrismaClient;
  server: Server;
}

export function startServer(options: StartServerOptions): StartedServer {
  const logger = options.logger ?? createLogger({ env: options.env });
  const createPrisma = options.createPrisma ?? createPrismaClient;
  const prisma = createPrisma({
    databaseUrl: options.databaseEnv.DATABASE_URL
  });
  const repository = createPrismaPublicCatalogRepository({ prisma });
  const publicCatalogService = createPublicCatalogService({ repository });
  const createAppOptions = {
    env: options.env,
    logger,
    publicCatalogService
  };
  const app = createApp(
    options.now === undefined
      ? createAppOptions
      : { ...createAppOptions, now: options.now }
  );
  const server = createServer(app);

  server.listen(options.env.PORT, () => {
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
        disconnect: () => prisma.$disconnect(),
        env: options.env,
        exit: (code) => process.exit(code),
        logger,
        signal: "SIGTERM"
      })
    );
    process.once(
      "SIGINT",
      createShutdownHandler(server, {
        disconnect: () => prisma.$disconnect(),
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
  const databaseEnv = parseDatabaseEnv(process.env);

  return startServer({ databaseEnv, env });
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
