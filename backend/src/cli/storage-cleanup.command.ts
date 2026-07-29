import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseRuntimeDatabaseEnv } from "../config/database-env.js";
import { parseStorageEnv, toStorageConfig } from "../config/storage-env.js";
import { createPrismaClient } from "../db/prisma.js";
import type { InteractiveTerminal } from "./cli.types.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import { createSupabaseImageStorage } from "../modules/images/supabase-image-storage.js";
import { createPrismaStorageCleanupRepository } from "../modules/storage-cleanup/storage-cleanup.repository.js";
import { createStorageCleanupWorker } from "../modules/storage-cleanup/storage-cleanup.worker.js";
import type { StorageCleanupWorker } from "../modules/storage-cleanup/storage-cleanup.types.js";

export interface StorageCleanupCommandOptions {
  processEnv?: NodeJS.ProcessEnv;
  terminal?: InteractiveTerminal;
  worker?: StorageCleanupWorker;
}

export async function runStorageCleanupCommand(
  options: StorageCleanupCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  const owned = options.worker === undefined ? createWorker(options) : undefined;
  const worker = options.worker ?? owned?.worker;

  if (worker === undefined) {
    return 1;
  }

  try {
    const result = await worker.tick();

    terminal.writeSafe(
      `${JSON.stringify({
        code: "storage_cleanup_tick",
        message: "Storage cleanup tick completed.",
        result
      })}\n`
    );

    return result.failed === 0 ? 0 : 1;
  } catch {
    terminal.writeSafe(
      `${JSON.stringify({
        code: "INTERNAL_ERROR",
        message: "Internal error."
      })}\n`
    );
    return 1;
  } finally {
    await owned?.disconnect();
    await terminal.close();
  }
}

function createWorker(options: StorageCleanupCommandOptions): {
  disconnect: () => Promise<void>;
  worker: StorageCleanupWorker;
} {
  const databaseEnv = parseRuntimeDatabaseEnv(options.processEnv ?? process.env);
  const storageConfig = toStorageConfig(
    parseStorageEnv(options.processEnv ?? process.env)
  );
  const prisma = createPrismaClient({
    databaseUrl: databaseEnv.DATABASE_URL
  });

  return {
    disconnect: () => prisma.$disconnect(),
    worker: createStorageCleanupWorker({
      clock: { now: () => new Date() },
      repository: createPrismaStorageCleanupRepository({ prisma }),
      storage: createSupabaseImageStorage(storageConfig)
    })
  };
}

if (isDirectRun()) {
  void runStorageCleanupCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
