import { createServer, type Server } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import type { AppEnv } from "./config/env.js";
import { parseEnv } from "./config/env.js";
import { createLogger, type AppLogger } from "./lib/logger.js";

export interface ShutdownHandlerOptions {
  env: AppEnv;
  exit: (code: number) => void;
  logger: AppLogger;
  now?: () => Date;
  signal: NodeJS.Signals;
  timeoutMs?: number;
}

export function startServer(env: AppEnv): Server {
  const logger = createLogger({ env });
  const app = createApp({ env, logger });
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logLifecycle({
      env,
      event: "server_started",
      logger,
      now: () => new Date()
    });
  });

  process.once(
    "SIGTERM",
    createShutdownHandler(server, {
      env,
      exit: (code) => process.exit(code),
      logger,
      signal: "SIGTERM"
    })
  );
  process.once(
    "SIGINT",
    createShutdownHandler(server, {
      env,
      exit: (code) => process.exit(code),
      logger,
      signal: "SIGINT"
    })
  );

  return server;
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
    });
  };
}

export function main(): Server {
  const env = parseEnv(process.env);

  return startServer(env);
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
