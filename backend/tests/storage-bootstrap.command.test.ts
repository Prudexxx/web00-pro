import { describe, expect, it } from "vitest";
import type { StorageConfig } from "../src/config/storage-env.js";
import {
  runStorageBootstrapCommand,
  type StorageBucketBootstrapStorage
} from "../src/cli/storage-bootstrap.command.js";
import type { InteractiveTerminal } from "../src/cli/cli.types.js";

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
      expect(expected).toBe("CREATE STORAGE BUCKET");
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

describe("runStorageBootstrapCommand", () => {
  it("is idempotent for a compatible existing public bucket", async () => {
    const term = terminal(false);
    const storage: StorageBucketBootstrapStorage = {
      async createBucket() {
        throw new Error("should not create");
      },
      async inspectBucket() {
        return {
          exists: true,
          compatible: true
        };
      }
    };

    await expect(
      runStorageBootstrapCommand({ config, storage, terminal: term })
    ).resolves.toBe(0);
    expect(JSON.stringify(term.output)).toContain("storage_bucket_ready");
    expect(JSON.stringify(term.output)).not.toContain("service-role-secret");
  });

  it("requires exact confirmation before creating an absent bucket", async () => {
    const term = terminal(true);
    const created: unknown[] = [];
    const storage: StorageBucketBootstrapStorage = {
      async createBucket(input) {
        created.push(input);
        return { created: true };
      },
      async inspectBucket() {
        return {
          exists: false
        };
      }
    };

    await expect(
      runStorageBootstrapCommand({ config, storage, terminal: term })
    ).resolves.toBe(0);
    expect(created).toEqual([
      {
        allowedMimeTypes: ["image/webp", "image/avif"],
        fileSizeLimit: 5 * 1024 * 1024,
        id: "web00-catalog-images",
        public: true
      }
    ]);
  });

  it("blocks incompatible buckets and missing confirmation without leaking secrets", async () => {
    const incompatible = terminal(false);
    const storage: StorageBucketBootstrapStorage = {
      async createBucket() {
        throw new Error("should not create");
      },
      async inspectBucket() {
        return {
          exists: true,
          compatible: false
        };
      }
    };

    await expect(
      runStorageBootstrapCommand({ config, storage, terminal: incompatible })
    ).resolves.toBe(1);
    expect(JSON.stringify(incompatible.output)).toContain("STORAGE_CONFIGURATION_INVALID");
    expect(JSON.stringify(incompatible.output)).not.toContain("service-role-secret");

    const denied = terminal(false);
    const absent: StorageBucketBootstrapStorage = {
      async createBucket() {
        throw new Error("should not create");
      },
      async inspectBucket() {
        return {
          exists: false
        };
      }
    };

    await expect(
      runStorageBootstrapCommand({ config, storage: absent, terminal: denied })
    ).resolves.toBe(1);
    expect(JSON.stringify(denied.output)).toContain("CLI_CONFIRMATION_REQUIRED");
  });
});
