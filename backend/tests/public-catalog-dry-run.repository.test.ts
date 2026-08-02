import { describe, expect, it, vi } from "vitest";
import {
  createDefaultPublicCatalogControlState,
  PUBLIC_CATALOG_CONTROL_ID,
  resolvePublicCatalogAnalysisRevision,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  createPrismaPublicCatalogDryRunRepository
} from "../src/modules/public-catalog/public-catalog-dry-run.repository.js";
import type { PublicCatalogReadOnlyTx } from "../src/modules/public-catalog/public-catalog-readonly-transaction.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";
import { createProjectionRecord } from "./public-catalog-snapshot-preparation.test.js";

describe("public catalog dry-run repository", () => {
  it("returns validated in-memory default control state when singleton row is absent", async () => {
    const tx = createReadOnlyTxFixture({ control: null });
    const repository = createPrismaPublicCatalogDryRunRepository({ tx });

    const state = await repository.readControlState();

    expect(state).toMatchObject({
      desiredRevision: 1,
      id: PUBLIC_CATALOG_CONTROL_ID,
      publishedRevision: 0,
      syncStatus: "pending"
    });
    expect(state).toEqual(createDefaultPublicCatalogControlState());
    expect(tx.publicCatalogControl.findUnique).toHaveBeenCalledTimes(1);
  });

  it("resolves analysis revision without mutating desired revision", () => {
    expect(
      resolvePublicCatalogAnalysisRevision(
        createControlStateFixture({ desiredRevision: 9, publishedRevision: 7 })
      )
    ).toBe(8);
    expect(
      resolvePublicCatalogAnalysisRevision(
        createControlStateFixture({
          desiredRevision: 7,
          publishedRevision: 7,
          syncStatus: "ready"
        })
      )
    ).toBe(7);
  });

  it("exposes only readControlState, readSettings, and listSnapshotSites", () => {
    const repository = createPrismaPublicCatalogDryRunRepository({
      tx: createReadOnlyTxFixture()
    });

    expect(Object.keys(repository).sort()).toEqual([
      "listSnapshotSites",
      "readControlState",
      "readSettings"
    ]);
  });

  it("reads settings and public projection through read-only delegates only", async () => {
    const records = [createProjectionRecord()];
    const tx = createReadOnlyTxFixture({
      control: { showDemoInModal: true },
      records
    });
    const repository = createPrismaPublicCatalogDryRunRepository({ tx });

    await expect(repository.readSettings()).resolves.toEqual({ showDemoInModal: true });
    await expect(repository.listSnapshotSites()).resolves.toEqual(records);
    expect(tx.publicCatalogControl.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.site.findMany).toHaveBeenCalledTimes(1);
  });
});

function createReadOnlyTxFixture(input: {
  control?: Partial<PublicCatalogControlState> | null;
  records?: PublicSiteRecord[];
} = {}) {
  const control =
    input.control === null ? null : createControlStateFixture(input.control);
  const records = input.records ?? [createProjectionRecord()];
  return {
    publicCatalogControl: {
      findUnique: vi.fn(async () => control)
    },
    site: {
      findMany: vi.fn(async () => records)
    }
  } satisfies PublicCatalogReadOnlyTx;
}

function createControlStateFixture(
  overrides: Partial<PublicCatalogControlState> = {}
): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}
