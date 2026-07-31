import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseRuntimeDatabaseEnv } from "../config/database-env.js";
import { createPrismaClient } from "../db/prisma.js";
import type { InteractiveTerminal } from "./cli.types.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import {
  formatCanonicalAssetReconciliationReport,
  reconcileCanonicalLegacyAssets,
  type CanonicalAssetReconciliationContext,
  type CanonicalAssetReconciliationOptions,
  type CanonicalAssetReconciliationRepository,
  type CanonicalAssetSourceCatalog
} from "../modules/admin/sites/canonical-asset-reconciliation.js";
import {
  createPrismaCanonicalAssetReconciliationRepository
} from "../modules/admin/sites/canonical-asset-reconciliation.repository.js";

export interface CanonicalLegacyAssetReconciliationCommandOptions {
  argv?: readonly string[];
  catalog?: CanonicalAssetSourceCatalog;
  context?: CanonicalAssetReconciliationContext;
  processEnv?: NodeJS.ProcessEnv;
  repository?: CanonicalAssetReconciliationRepository;
  terminal?: InteractiveTerminal;
}

interface ParsedArgs {
  apply: boolean;
  confirm: string | undefined;
  ok: true;
}

interface RejectedArgs {
  code: string;
  message: string;
  ok: false;
}

export async function runCanonicalLegacyAssetReconciliationCommand(
  options: CanonicalLegacyAssetReconciliationCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  let disconnect: (() => Promise<void>) | null = null;

  try {
    const args = parseCanonicalLegacyAssetReconciliationArgs(
      options.argv ?? process.argv.slice(2)
    );
    if (!args.ok) {
      terminal.writeSafe(`${JSON.stringify(args)}\n`);
      return 1;
    }

    let repository = options.repository;
    if (repository === undefined) {
      let databaseUrl: string;
      try {
        databaseUrl = parseRuntimeDatabaseEnv(
          options.processEnv ?? process.env
        ).DATABASE_URL;
      } catch {
        terminal.writeSafe(
          `${JSON.stringify({
            code: "DATABASE_ENV_REQUIRED",
            message: "DATABASE_URL is required for canonical asset reconciliation dry-run/apply."
          })}\n`
        );
        return 1;
      }

      const prisma = createPrismaClient({ databaseUrl });
      disconnect = () => prisma.$disconnect();
      repository = createPrismaCanonicalAssetReconciliationRepository({ prisma });
    }

    const catalog = options.catalog ?? await readSourceCatalog();
    const context = options.context ?? createCliContext();
    const serviceOptions: CanonicalAssetReconciliationOptions = {
      apply: args.apply,
      catalog,
      context,
      repository
    };
    if (args.confirm !== undefined) {
      serviceOptions.confirm = args.confirm;
    }

    const report = await reconcileCanonicalLegacyAssets(serviceOptions);
    terminal.writeSafe(`${formatCanonicalAssetReconciliationReport(report)}\n`);

    return report.status === "blocked" ? 1 : 0;
  } catch {
    terminal.writeSafe(
      `${JSON.stringify({
        code: "INTERNAL_ERROR",
        message: "Internal error."
      })}\n`
    );
    return 1;
  } finally {
    await disconnect?.();
    await terminal.close();
  }
}

export function parseCanonicalLegacyAssetReconciliationArgs(
  argv: readonly string[]
): ParsedArgs | RejectedArgs {
  let apply = false;
  let confirm: string | undefined;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length);
      continue;
    }

    return {
      code: "CLI_ARGUMENTS_INVALID",
      message: "Only --apply and --confirm=WEB00-CANONICAL-ASSETS-15-7 are supported.",
      ok: false
    };
  }

  return {
    apply,
    confirm,
    ok: true
  };
}

async function readSourceCatalog(): Promise<CanonicalAssetSourceCatalog> {
  const file = path.join(
    process.cwd(),
    "prisma",
    "seed-data",
    "web00-catalog.json"
  );
  const raw = await readFile(file, "utf8");

  return JSON.parse(raw) as CanonicalAssetSourceCatalog;
}

function createCliContext(): CanonicalAssetReconciliationContext {
  return {
    actorUserId: null,
    ipHash: null,
    requestId: `req_canonical_assets_${randomUUID()}`,
    userAgentHash: null
  };
}

if (isDirectRun()) {
  void runCanonicalLegacyAssetReconciliationCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
