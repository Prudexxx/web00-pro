import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertNoCardObjectConstruction,
  assertNoDataJsImport,
  assertNoFixtureImport,
  assertNoJsonStringCardPayload,
  assertNoLegacyReleaseMerge,
  assertNoManualProductionItemConstruction,
  assertNoSlugTitleSwitchOrMap,
  buildProductionImportGraph,
  collectProductionV2Files,
  loadV2ManifestChunkChainVerifier,
  parseProductionModuleAst,
} from "./helpers/public-catalog-v2-provenance-fixture.mjs";

test("Public Catalog V2 production generator and reader have verified release provenance", async () => {
  const productionV2Files = await collectProductionV2Files([
    "scripts/build-public-catalog-emergency-release.mjs",
    "backend/src/modules/public-catalog-v2/*.ts",
    "assets/js/public-catalog-v2-*.js",
    "assets/js/public-catalog-emergency-release.js",
    "assets/js/catalog-api.js",
    "assets/js/main.js"
  ]);
  const importGraph = await buildProductionImportGraph(productionV2Files);

  for (const relativePath of productionV2Files) {
    const ast = await parseProductionModuleAst(relativePath);

    assertNoDataJsImport(importGraph, relativePath);
    assertNoFixtureImport(importGraph, relativePath);
    assertNoCardObjectConstruction(ast);
    assertNoManualProductionItemConstruction(ast);
    assertNoSlugTitleSwitchOrMap(ast);
    assertNoJsonStringCardPayload(ast);
    assertNoLegacyReleaseMerge(ast);
  }
});

test("fabricated valid-looking cards are rejected outside a verified manifest and chunk checksum chain", async () => {
  const fabricated = {
    chunks: [{ items: [{ slug: "synthetic-fixture-card", title: "Synthetic fixture" }] }],
    manifest: {
      chunks: [
        {
          path: "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json",
          sha256: "0".repeat(64)
        }
      ],
      revision: 7
    }
  };

  const verifyV2ManifestChunkChain = await loadV2ManifestChunkChainVerifier();

  await assert.rejects(() => verifyV2ManifestChunkChain(fabricated), /PUBLIC_CATALOG_V2_PROVENANCE_INVALID/);
});
