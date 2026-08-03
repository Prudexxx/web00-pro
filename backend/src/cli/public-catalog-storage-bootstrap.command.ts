import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { StorageConfig } from "../config/storage-env.js";
import { parseStorageEnv, toStorageConfig } from "../config/storage-env.js";
import { AppError } from "../lib/errors.js";
import { CliError } from "./cli-errors.js";
import type { InteractiveTerminal } from "./cli.types.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import {
  PUBLIC_CATALOG_STORAGE_BUCKET,
  PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG,
  createPublicCatalogStorageBucketManager,
  type PublicCatalogStorageBucketManager
} from "../modules/public-catalog/public-catalog-storage-bucket.js";

export interface PublicCatalogStorageBootstrapCommandOptions {
  config?: StorageConfig;
  manager?: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect">;
  processEnv?: NodeJS.ProcessEnv;
  randomUUID?: () => string;
  terminal?: InteractiveTerminal;
}

export async function runPublicCatalogStorageBootstrapCommand(
  options: PublicCatalogStorageBootstrapCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  const requestId = `cli:${(options.randomUUID ?? randomUUID)()}`;

  try {
    const config =
      options.config ?? toStorageConfig(parseStorageEnv(options.processEnv ?? process.env));
    const manager = options.manager ?? createPublicCatalogStorageBucketManager(config);
    const inspection = await manager.inspect({ requestId });

    if (inspection.exists && inspection.compatible) {
      writeOutput(terminal, readyOutput(requestId));
      return 0;
    }

    if (inspection.exists && !inspection.compatible) {
      throw storageConfigurationInvalid();
    }

    writeOutput(terminal, {
      code: "public_catalog_bucket_create_plan",
      config: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG,
      message: "Public catalog bucket is absent.",
      requestId
    });

    const confirmed = await terminal.confirmExact(
      "Type CREATE PUBLIC CATALOG BUCKET to continue: ",
      "CREATE PUBLIC CATALOG BUCKET"
    );

    if (!confirmed) {
      throw new CliError("CLI_CONFIRMATION_REQUIRED");
    }

    const ensureResult = await manager.ensureReady({ requestId });

    if (ensureResult.status === "created") {
      writeOutput(terminal, {
        code: "public_catalog_bucket_created",
        message: "Public catalog bucket was created.",
        requestId
      });
    }

    writeOutput(terminal, readyOutput(requestId));
    return 0;
  } catch (error) {
    writeOutput(terminal, safeErrorOutput(error, requestId));
    return 1;
  } finally {
    await terminal.close();
  }
}

function readyOutput(requestId: string): Record<string, unknown> {
  return {
    bucket: PUBLIC_CATALOG_STORAGE_BUCKET,
    code: "public_catalog_bucket_ready",
    fileSizeLimit: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.fileSizeLimit,
    message: "Public catalog bucket is ready.",
    mime: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.allowedMimeTypes,
    public: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.public,
    requestId
  };
}

function safeErrorOutput(error: unknown, requestId: string): Record<string, unknown> {
  if (error instanceof CliError) {
    return {
      code: error.code,
      message: error.message,
      requestId
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      requestId
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Internal error.",
    requestId
  };
}

function writeOutput(terminal: InteractiveTerminal, output: Record<string, unknown>): void {
  terminal.writeSafe(`${JSON.stringify(output)}\n`);
}

function storageConfigurationInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
    message: "Public catalog storage configuration is invalid.",
    statusCode: 503
  });
}

if (isDirectRun()) {
  void runPublicCatalogStorageBootstrapCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
