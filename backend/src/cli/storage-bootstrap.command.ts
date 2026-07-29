import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { StorageConfig } from "../config/storage-env.js";
import { parseStorageEnv, toStorageConfig } from "../config/storage-env.js";
import { AppError } from "../lib/errors.js";
import { CliError } from "./cli-errors.js";
import type { InteractiveTerminal } from "./cli.types.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import type {
  StorageBucketConfig,
  StorageBucketInspection,
  StorageBucketResult
} from "../modules/images/image-storage.js";
import { createSupabaseImageStorage } from "../modules/images/supabase-image-storage.js";

export interface StorageBucketBootstrapStorage {
  createBucket(input: StorageBucketConfig): Promise<StorageBucketResult>;
  inspectBucket(bucket: string): Promise<StorageBucketInspection>;
}

export interface StorageBootstrapCommandOptions {
  config?: StorageConfig;
  processEnv?: NodeJS.ProcessEnv;
  randomUUID?: () => string;
  storage?: StorageBucketBootstrapStorage;
  terminal?: InteractiveTerminal;
}

const desiredBucketConfig: StorageBucketConfig = {
  allowedMimeTypes: ["image/webp", "image/avif"],
  fileSizeLimit: 5 * 1024 * 1024,
  id: "web00-catalog-images",
  public: true
};

export async function runStorageBootstrapCommand(
  options: StorageBootstrapCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  const requestId = `cli:${(options.randomUUID ?? randomUUID)()}`;

  try {
    const config =
      options.config ?? toStorageConfig(parseStorageEnv(options.processEnv ?? process.env));
    const storage = options.storage ?? createSupabaseImageStorage(config);
    const inspection = await storage.inspectBucket(config.bucket);

    if (inspection.exists && inspection.compatible) {
      writeOutput(terminal, {
        code: "storage_bucket_ready",
        message: "Storage bucket is ready.",
        requestId
      });
      return 0;
    }

    if (inspection.exists && !inspection.compatible) {
      throw new AppError({
        code: "STORAGE_CONFIGURATION_INVALID",
        message: "Storage bucket configuration is incompatible.",
        statusCode: 503
      });
    }

    writeOutput(terminal, {
      code: "storage_bucket_create_plan",
      config: desiredBucketConfig,
      message: "Storage bucket is absent.",
      requestId
    });

    const confirmed = await terminal.confirmExact(
      "Type CREATE STORAGE BUCKET to continue: ",
      "CREATE STORAGE BUCKET"
    );

    if (!confirmed) {
      throw new CliError("CLI_CONFIRMATION_REQUIRED");
    }

    await storage.createBucket(desiredBucketConfig);
    writeOutput(terminal, {
      code: "storage_bucket_created",
      message: "Storage bucket was created.",
      requestId
    });
    return 0;
  } catch (error) {
    writeOutput(terminal, safeErrorOutput(error, requestId));
    return 1;
  } finally {
    await terminal.close();
  }
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

if (isDirectRun()) {
  void runStorageBootstrapCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
