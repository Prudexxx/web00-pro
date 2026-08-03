import { describe, expect, it, vi } from "vitest";
import type { StorageConfig } from "../src/config/storage-env.js";
import type { InteractiveTerminal } from "../src/cli/cli.types.js";
import {
  runPublicCatalogStorageBootstrapCommand
} from "../src/cli/public-catalog-storage-bootstrap.command.js";
import type {
  PublicCatalogStorageBucketManager
} from "../src/modules/public-catalog/public-catalog-storage-bucket.js";

const config: StorageConfig = {
  bucket: "web00-catalog-images",
  credentials: {
    serviceRoleKey: "service-role-secret",
    supabaseUrl: "https://project.supabase.co"
  },
  publicBaseUrl: "https://storage.example.test",
  workerEnabled: false,
  workerPollIntervalSeconds: 60
};

function terminal(confirm: boolean): InteractiveTerminal & { output: string[] } {
  const output: string[] = [];

  return {
    output,
    async close() {
      return undefined;
    },
    async confirmExact(_label: string, expected: string) {
      expect(expected).toBe("CREATE PUBLIC CATALOG BUCKET");
      return confirm;
    },
    async promptSecret() {
      throw new Error("unused");
    },
    async promptVisible() {
      throw new Error("unused");
    },
    writeSafe(message: string) {
      output.push(message);
    }
  };
}

describe("runPublicCatalogStorageBootstrapCommand", () => {
  it("creates an absent public catalog bucket after exact confirmation and verifies compatibility", async () => {
    const term = terminal(true);
    const manager: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect"> = {
      ensureReady: vi.fn(async () => ({ status: "created" as const })),
      inspect: vi.fn(async () => ({
        compatible: false,
        exists: false
      }))
    };

    await expect(
      runPublicCatalogStorageBootstrapCommand({ config, manager, terminal: term })
    ).resolves.toBe(0);

    expect(manager.inspect).toHaveBeenCalledTimes(1);
    expect(manager.ensureReady).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(term.output)).toContain("public_catalog_bucket_create_plan");
    expect(JSON.stringify(term.output)).toContain("public_catalog_bucket_created");
    expect(JSON.stringify(term.output)).toContain("public_catalog_bucket_ready");
    expect(JSON.stringify(term.output)).not.toContain("service-role-secret");
  });

  it("is idempotent when the public catalog bucket is already compatible", async () => {
    const term = terminal(false);
    const manager: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect"> = {
      ensureReady: vi.fn(async () => {
        throw new Error("should not create");
      }),
      inspect: vi.fn(async () => ({
        compatible: true,
        exists: true
      }))
    };

    await expect(
      runPublicCatalogStorageBootstrapCommand({ config, manager, terminal: term })
    ).resolves.toBe(0);

    expect(manager.inspect).toHaveBeenCalledTimes(1);
    expect(manager.ensureReady).not.toHaveBeenCalled();
    expect(JSON.stringify(term.output)).toContain("public_catalog_bucket_ready");
    expect(JSON.stringify(term.output)).not.toContain("service-role-secret");
  });

  it("blocks incompatible buckets and wrong confirmation without leaking secrets", async () => {
    const incompatible = terminal(false);
    const manager: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect"> = {
      ensureReady: vi.fn(async () => ({ status: "created" as const })),
      inspect: vi.fn(async () => ({
        compatible: false,
        exists: true
      }))
    };

    await expect(
      runPublicCatalogStorageBootstrapCommand({
        config,
        manager,
        terminal: incompatible
      })
    ).resolves.toBe(1);
    expect(manager.ensureReady).not.toHaveBeenCalled();
    expect(JSON.stringify(incompatible.output)).toContain(
      "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID"
    );
    expect(JSON.stringify(incompatible.output)).not.toContain("service-role-secret");

    const denied = terminal(false);
    const absent: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect"> = {
      ensureReady: vi.fn(async () => ({ status: "created" as const })),
      inspect: vi.fn(async () => ({
        compatible: false,
        exists: false
      }))
    };

    await expect(
      runPublicCatalogStorageBootstrapCommand({ config, manager: absent, terminal: denied })
    ).resolves.toBe(1);
    expect(absent.ensureReady).not.toHaveBeenCalled();
    expect(JSON.stringify(denied.output)).toContain("CLI_CONFIRMATION_REQUIRED");
    expect(JSON.stringify(denied.output)).not.toContain("service-role-secret");
  });

  it("turns provider failures into safe output without provider bodies", async () => {
    const term = terminal(true);
    const manager: Pick<PublicCatalogStorageBucketManager, "ensureReady" | "inspect"> = {
      async ensureReady() {
        throw new Error(
          "provider body Authorization Bearer service-role-secret storage/v1/object"
        );
      },
      async inspect() {
        return {
          compatible: false,
          exists: false
        };
      }
    };

    await expect(
      runPublicCatalogStorageBootstrapCommand({ config, manager, terminal: term })
    ).resolves.toBe(1);

    expect(JSON.stringify(term.output)).toContain("INTERNAL_ERROR");
    expect(JSON.stringify(term.output)).not.toMatch(
      /Authorization|Bearer|service-role-secret|storage\/v1\/object|provider body/i
    );
  });

});
