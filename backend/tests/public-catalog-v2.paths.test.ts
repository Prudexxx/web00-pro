import { describe, expect, it } from "vitest";

const pathsModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.paths.js";

async function importPathsModule(): Promise<Record<string, unknown>> {
  try {
    return await import(pathsModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 path contract module to exist; OPV2-1 is RED until V2 paths are implemented.",
      { cause: error }
    );
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected Public Catalog V2 path export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

describe("Public Catalog V2 storage paths", () => {
  it("uses the canonical JSON bucket layout and rejects image-bucket catalog paths", async () => {
    const module = await importPathsModule();
    const buildPublicCatalogV2ActivePath = readFunction(module, "buildPublicCatalogV2ActivePath");
    const buildPublicCatalogV2ReleasePath = readFunction(module, "buildPublicCatalogV2ReleasePath");
    const buildPublicCatalogV2ChunkPath = readFunction(module, "buildPublicCatalogV2ChunkPath");
    const assertPublicCatalogV2StoragePath = readFunction(module, "assertPublicCatalogV2StoragePath");

    expect(module.PUBLIC_CATALOG_V2_JSON_BUCKET).toBe("web00-public-catalog");
    expect(module.PUBLIC_CATALOG_V2_SCHEMA_VERSION).toBe(2);
    expect(buildPublicCatalogV2ActivePath()).toBe("public-catalog/v2/active.json");
    expect(buildPublicCatalogV2ReleasePath(7, "manifest")).toBe(
      "public-catalog/v2/releases/revision-7/manifest.json"
    );
    expect(buildPublicCatalogV2ReleasePath(7, "index")).toBe(
      "public-catalog/v2/releases/revision-7/index.json"
    );
    expect(buildPublicCatalogV2ReleasePath(7, "popular")).toBe(
      "public-catalog/v2/releases/revision-7/popular.json"
    );
    expect(buildPublicCatalogV2ReleasePath(7, "categories")).toBe(
      "public-catalog/v2/releases/revision-7/categories.json"
    );
    expect(buildPublicCatalogV2ChunkPath(7, 1)).toBe(
      "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json"
    );

    expect(() => assertPublicCatalogV2StoragePath("web00-catalog-images/public-catalog/v2/active.json")).toThrow(
      "Invalid Public Catalog V2 Storage path."
    );
    expect(() =>
      assertPublicCatalogV2StoragePath("public-catalog/v2/releases/revision-7/chunks/chunk-000000.json")
    ).toThrow("Invalid Public Catalog V2 Storage path.");
  });

  it("requires immutable release artifacts to be verified before the active pointer switches last", async () => {
    const module = await importPathsModule();
    const buildPublicCatalogV2ActivationPlan = readFunction(module, "buildPublicCatalogV2ActivationPlan");

    expect(buildPublicCatalogV2ActivationPlan(11)).toEqual([
      "public-catalog/v2/releases/revision-11/chunks/chunk-000001.json",
      "public-catalog/v2/releases/revision-11/index.json",
      "public-catalog/v2/releases/revision-11/popular.json",
      "public-catalog/v2/releases/revision-11/categories.json",
      "public-catalog/v2/releases/revision-11/manifest.json",
      "public-catalog/v2/active.json"
    ]);
  });

  it("keeps rollback auditable without force-push rollback and retains V1 recovery until final acceptance", async () => {
    const module = await importPathsModule();
    const buildPublicCatalogV2RollbackPlan = readFunction(module, "buildPublicCatalogV2RollbackPlan");

    expect(buildPublicCatalogV2RollbackPlan({ fromRevision: 12, toRevision: 11 })).toEqual({
      activePointerPath: "public-catalog/v2/active.json",
      eventType: "rollback",
      forcePush: false,
      oldReleaseReadable: "public-catalog/v2/releases/revision-12/manifest.json",
      previousRevision: 12,
      reconcileDbFinalizeAfterPointer: true,
      targetRevision: 11,
      targetReleaseReadable: "public-catalog/v2/releases/revision-11/manifest.json",
      v1RecoveryRetainedUntil: "OPV2-10_E2E_PASS"
    });
  });
});
