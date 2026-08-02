import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  acquirePublicCatalogLeaseState,
  assertPublicCatalogRevision,
  createPrismaPublicCatalogSyncRepository,
  finalizePublicCatalogLeaseState,
  markPublicCatalogDirtyState,
  recoverStalePublicCatalogLeaseState,
  validatePublicCatalogControlState,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";

const now = new Date("2026-08-01T00:00:00.000Z");

function control(overrides: Partial<PublicCatalogControlState> = {}): PublicCatalogControlState {
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

describe("public catalog control state", () => {
  it("keeps the singleton id and revision invariants valid", () => {
    expect(validatePublicCatalogControlState(control())).toEqual(control());
    expect(() => validatePublicCatalogControlState(control({ id: "other" }))).toThrow(
      /singleton/i
    );
    expect(() =>
      validatePublicCatalogControlState(control({ desiredRevision: 0 }))
    ).toThrow(/revision/i);
    expect(() =>
      validatePublicCatalogControlState(
        control({ desiredRevision: 3, publishedRevision: 4, syncStatus: "ready" })
      )
    ).toThrow(/desiredRevision/i);
    expect(() =>
      validatePublicCatalogControlState(
        control({ syncStatus: "unknown" as PublicCatalogControlState["syncStatus"] })
      )
    ).toThrow(/syncStatus/i);
  });

  it("rejects unsafe revision boundaries before DB writes", () => {
    expect(assertPublicCatalogRevision(1)).toBe(1);
    expect(assertPublicCatalogRevision(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER
    );
    for (const value of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      expect(() => assertPublicCatalogRevision(value)).toThrow(/revision/i);
    }
  });

  it("marks dirty by incrementing desiredRevision and preserving the published revision", () => {
    const dirty = markPublicCatalogDirtyState(
      control({ desiredRevision: 3, publishedRevision: 3, syncStatus: "ready" }),
      "site.publish"
    );

    expect(dirty).toMatchObject({
      desiredRevision: 4,
      lastSyncErrorCode: null,
      publishedRevision: 3,
      syncStatus: "pending"
    });
  });

  it("recovers stale leases but preserves fresh leases", () => {
    const stale = recoverStalePublicCatalogLeaseState(
      control({
        syncLeaseExpiresAt: new Date("2026-07-31T23:59:59.000Z"),
        syncLeaseId: "lease_old",
        syncStatus: "syncing"
      }),
      now
    );
    const fresh = recoverStalePublicCatalogLeaseState(
      control({
        syncLeaseExpiresAt: new Date("2026-08-01T00:01:00.000Z"),
        syncLeaseId: "lease_fresh",
        syncStatus: "syncing"
      }),
      now
    );

    expect(stale).toMatchObject({
      syncLeaseExpiresAt: null,
      syncLeaseId: null,
      syncStatus: "pending"
    });
    expect(fresh.syncStatus).toBe("syncing");
    expect(fresh.syncLeaseId).toBe("lease_fresh");
  });

  it("does not allow old leases or old revisions to finalize", () => {
    const leased = acquirePublicCatalogLeaseState(control(), {
      leaseId: "lease_new",
      now,
      ttlMs: 30_000
    });

    expect(() =>
      finalizePublicCatalogLeaseState(leased.state, {
        checksum: "a".repeat(64),
        itemsCount: 1,
        leaseId: "lease_old",
        publishedRevision: leased.revision,
        requestId: "req_old",
        snapshotPath: "public-catalog/v1/snapshots/revision-1.json"
      })
    ).toThrow(/lease/i);

    const dirtyDuringSync = markPublicCatalogDirtyState(leased.state, "site.update");
    const finalized = finalizePublicCatalogLeaseState(dirtyDuringSync, {
      checksum: "b".repeat(64),
      itemsCount: 1,
      leaseId: "lease_new",
      publishedRevision: leased.revision,
      requestId: "req_ok",
      snapshotPath: "public-catalog/v1/snapshots/revision-1.json"
    });

    expect(finalized).toMatchObject({
      desiredRevision: 2,
      publishedRevision: 1,
      syncStatus: "pending"
    });
  });

  it("does not acquire a lease when another sync wins the control-row update", async () => {
    const upserted = control({
      desiredRevision: 2,
      publishedRevision: 1,
      syncStatus: "pending"
    });
    const prisma = {
      publicCatalogControl: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue(upserted)
      }
    };
    const repository = createPrismaPublicCatalogSyncRepository({
      prisma: prisma as never
    });

    await expect(
      repository.acquireLease({
        leaseId: "lease_lost",
        now,
        ttlMs: 30_000
      })
    ).resolves.toBeNull();
    expect(prisma.publicCatalogControl.updateMany).toHaveBeenCalledWith({
      data: {
        syncLeaseExpiresAt: new Date("2026-08-01T00:00:30.000Z"),
        syncLeaseId: "lease_lost",
        syncStatus: "syncing"
      },
      where: {
        desiredRevision: 2,
        id: PUBLIC_CATALOG_CONTROL_ID,
        publishedRevision: 1,
        syncLeaseExpiresAt: null,
        syncLeaseId: null,
        syncStatus: "pending"
      }
    });
  });

  it("keeps invariants across deterministic randomized schedules", () => {
    let state = control({ desiredRevision: 1, publishedRevision: 0, syncStatus: "pending" });
    let activeLease: string | null = null;

    for (let seed = 0; seed < 300; seed += 1) {
      const op = (seed * 48271) % 7;
      if (op === 0 || op === 1) {
        state = markPublicCatalogDirtyState(state, "site.update");
      } else if (op === 2 && state.syncStatus !== "syncing") {
        const leaseId = `lease_${seed}`;
        const acquired = acquirePublicCatalogLeaseState(state, {
          leaseId,
          now,
          ttlMs: 30_000
        });
        state = acquired.state;
        activeLease = leaseId;
      } else if (op === 3 && activeLease !== null) {
        state = finalizePublicCatalogLeaseState(state, {
          checksum: "c".repeat(64),
          itemsCount: 16,
          leaseId: activeLease,
          publishedRevision: state.publishedRevision + 1,
          requestId: `req_${seed}`,
          snapshotPath: `public-catalog/v1/snapshots/revision-${state.publishedRevision + 1}.json`
        });
        activeLease = null;
      } else if (op === 4) {
        state = recoverStalePublicCatalogLeaseState(
          {
            ...state,
            syncLeaseExpiresAt:
              state.syncStatus === "syncing"
                ? new Date("2026-07-31T23:59:59.000Z")
                : state.syncLeaseExpiresAt
          },
          now
        );
      }

      expect(validatePublicCatalogControlState(state)).toBe(state);
      expect(state.desiredRevision).toBeGreaterThanOrEqual(state.publishedRevision);
      expect(["pending", "syncing", "ready", "failed"]).toContain(state.syncStatus);
    }
  });
});
