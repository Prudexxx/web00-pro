import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  acquirePublicCatalogLeaseState,
  createPrismaPublicCatalogSyncRepository,
  finalizePublicCatalogLeaseState,
  isPublicCatalogReadyForTarget,
  markPublicCatalogDirty,
  markPublicCatalogDirtyState,
  recoverStalePublicCatalogLeaseState,
  updatePublicCatalogSettings,
  validatePublicCatalogControlState,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  createPublicRuntimeTargetKey,
  type PublicRuntimeTargetConfig
} from "../src/modules/public-catalog/public-runtime-target.js";

const now = new Date("2026-08-07T12:00:00.000Z");

function control(overrides: Partial<PublicCatalogControlState> = {}): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotGeneratedAt: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    publishedRuntimeTargetKey: null,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}

function applyControlMutation(
  state: PublicCatalogControlState,
  data: Record<string, unknown>
): PublicCatalogControlState {
  if ("desiredRevision" in data) {
    const value = data.desiredRevision;
    if (
      typeof value === "object" &&
      value !== null &&
      "increment" in value &&
      typeof value.increment === "number"
    ) {
      state.desiredRevision += value.increment;
    } else if (typeof value === "number") {
      state.desiredRevision = value;
    }
  }
  if (typeof data.publishedRevision === "number") {
    state.publishedRevision = data.publishedRevision;
  }
  if ("publishedRuntimeTargetKey" in data) {
    state.publishedRuntimeTargetKey = data.publishedRuntimeTargetKey as string | null;
  }
  if (typeof data.showDemoInModal === "boolean") {
    state.showDemoInModal = data.showDemoInModal;
  }
  if (typeof data.syncStatus === "string") {
    state.syncStatus = data.syncStatus as PublicCatalogControlState["syncStatus"];
  }
  if ("syncLeaseId" in data) {
    state.syncLeaseId = data.syncLeaseId as string | null;
  }
  if ("syncLeaseExpiresAt" in data) {
    state.syncLeaseExpiresAt = data.syncLeaseExpiresAt as Date | null;
  }
  if ("lastSyncErrorCode" in data) {
    state.lastSyncErrorCode = data.lastSyncErrorCode as string | null;
  }
  if ("lastSyncRequestId" in data) {
    state.lastSyncRequestId = data.lastSyncRequestId as string | null;
  }
  return { ...state };
}

function matchesControlWhere(
  state: PublicCatalogControlState,
  where: Record<string, unknown>
): boolean {
  if (typeof where.id === "string" && where.id !== state.id) return false;
  if (
    typeof where.showDemoInModal === "object" &&
    where.showDemoInModal !== null &&
    "not" in where.showDemoInModal &&
    typeof where.showDemoInModal.not === "boolean" &&
    state.showDemoInModal === where.showDemoInModal.not
  ) {
    return false;
  }
  if (typeof where.desiredRevision === "number" && where.desiredRevision !== state.desiredRevision) {
    return false;
  }
  if (
    typeof where.desiredRevision === "object" &&
    where.desiredRevision !== null &&
    "gte" in where.desiredRevision &&
    typeof where.desiredRevision.gte === "number" &&
    state.desiredRevision < where.desiredRevision.gte
  ) {
    return false;
  }
  if (typeof where.publishedRevision === "number" && where.publishedRevision !== state.publishedRevision) {
    return false;
  }
  if ("syncLeaseId" in where && where.syncLeaseId !== state.syncLeaseId) {
    return false;
  }
  if ("syncStatus" in where && where.syncStatus !== state.syncStatus) {
    return false;
  }
  if ("syncLeaseExpiresAt" in where) {
    const filter = where.syncLeaseExpiresAt;
    if (filter === null && state.syncLeaseExpiresAt !== null) return false;
    if (filter instanceof Date && state.syncLeaseExpiresAt?.getTime() !== filter.getTime()) return false;
    if (
      typeof filter === "object" &&
      filter !== null &&
      "gt" in filter &&
      filter.gt instanceof Date &&
      (state.syncLeaseExpiresAt === null ||
        state.syncLeaseExpiresAt.getTime() <= filter.gt.getTime())
    ) {
      return false;
    }
  }
  return true;
}

function createMutableControlTable(initial: Partial<PublicCatalogControlState>) {
  const state = control(initial);
  const publicCatalogControl = {
    findUnique: vi.fn(async () => ({ ...state })),
    updateMany: vi.fn(async (input) => {
      if (!matchesControlWhere(state, input.where as Record<string, unknown>)) {
        return { count: 0 };
      }
      applyControlMutation(state, input.data as Record<string, unknown>);
      return { count: 1 };
    }),
    upsert: vi.fn(async (input) =>
      applyControlMutation(state, (input.update ?? input.create) as Record<string, unknown>)
    )
  };

  return { publicCatalogControl, state };
}

function publicCatalogContext(requestId: string) {
  return {
    actorUserId: "11111111-1111-4111-8111-111111111111",
    requestId
  };
}

describe("public catalog durable control state", () => {
  it("rejects false-ready durable state when published target key is legacy null", () => {
    const state = validatePublicCatalogControlState(control({
      desiredRevision: 4,
      publishedRevision: 4,
      publishedRuntimeTargetKey: null,
      syncStatus: "ready"
    }));
    const targetKey = createPublicRuntimeTargetKey(primaryTargetFixture());

    expect(isPublicCatalogReadyForTarget(state, targetKey, now)).toBe(false);
  });

  it("stores the current target key when finalizing a fenced publication", () => {
    const targetKey = createPublicRuntimeTargetKey(primaryTargetFixture());
    const finalized = finalizePublicCatalogLeaseState(control({
      desiredRevision: 5,
      publishedRevision: 4,
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-5",
      syncStatus: "syncing"
    }), {
      checksum: "a".repeat(64),
      generatedAt: now,
      itemsCount: 17,
      leaseId: "lease-5",
      publishedRevision: 5,
      publishedRuntimeTargetKey: targetKey,
      requestId: "req-target-identity",
      snapshotPath: `runtime/production/catalog/v1/releases/revision-5-${"a".repeat(64)}.json`
    });

    expect(finalized.publishedRuntimeTargetKey).toBe(targetKey);
    expect(finalized.syncStatus).toBe("ready");
  });

  it("validates singleton revision and sync status invariants", () => {
    expect(validatePublicCatalogControlState(control())).toEqual(control());
    expect(() => validatePublicCatalogControlState(control({ id: "other" }))).toThrow(/singleton/i);
    expect(() => validatePublicCatalogControlState(control({ desiredRevision: 0 }))).toThrow(/revision/i);
    expect(() =>
      validatePublicCatalogControlState(control({ desiredRevision: 1, publishedRevision: 2 }))
    ).toThrow(/desiredRevision/i);
    expect(() =>
      validatePublicCatalogControlState(control({ syncStatus: "unknown" as never }))
    ).toThrow(/syncStatus/i);
  });

  it("acquires only one lease for the pending revision and rejects an active lease", () => {
    const acquired = acquirePublicCatalogLeaseState(control(), {
      leaseId: "lease-one",
      now,
      targetKey: primaryTargetKey(),
      ttlMs: 60_000
    });

    expect(acquired).toMatchObject({
      revision: 1,
      state: {
        syncLeaseId: "lease-one",
        syncStatus: "syncing"
      }
    });
    expect(() =>
      acquirePublicCatalogLeaseState(acquired.state, {
        leaseId: "lease-two",
        now,
        targetKey: primaryTargetKey(),
        ttlMs: 60_000
      })
    ).toThrow(/active|lease/i);
  });

  it("recovers stale leases but leaves fresh leases fenced", () => {
    const stale = recoverStalePublicCatalogLeaseState(control({
      syncLeaseExpiresAt: new Date("2026-08-07T11:59:00.000Z"),
      syncLeaseId: "lease-old",
      syncStatus: "syncing"
    }), now);
    const fresh = recoverStalePublicCatalogLeaseState(control({
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-fresh",
      syncStatus: "syncing"
    }), now);

    expect(stale).toMatchObject({
      syncLeaseExpiresAt: null,
      syncLeaseId: null,
      syncStatus: "pending"
    });
    expect(fresh).toMatchObject({
      syncLeaseId: "lease-fresh",
      syncStatus: "syncing"
    });
  });

  it("rejects old lease finalization and keeps mutations during sync pending", () => {
    const acquired = acquirePublicCatalogLeaseState(control(), {
      leaseId: "lease-current",
      now,
      targetKey: primaryTargetKey(),
      ttlMs: 60_000
    });

    expect(() =>
      finalizePublicCatalogLeaseState(acquired.state, {
        checksum: "a".repeat(64),
        generatedAt: now,
        itemsCount: 1,
        leaseId: "lease-old",
        publishedRevision: acquired.revision,
        publishedRuntimeTargetKey: primaryTargetKey(),
        requestId: "req-old",
        snapshotPath: "catalog/v1/releases/revision-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
      })
    ).toThrow(/lease/i);

    const dirtyDuringSync = markPublicCatalogDirtyState(acquired.state);
    const finalized = finalizePublicCatalogLeaseState(dirtyDuringSync, {
      checksum: "b".repeat(64),
      generatedAt: now,
      itemsCount: 1,
      leaseId: "lease-current",
      publishedRevision: acquired.revision,
      publishedRuntimeTargetKey: primaryTargetKey(),
      requestId: "req-current",
      snapshotPath: "catalog/v1/releases/revision-1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json"
    });

    expect(finalized).toMatchObject({
      desiredRevision: 2,
      publishedRevision: 1,
      syncStatus: "pending"
    });
  });

  it("increments desiredRevision inside the caller transaction and writes a safe audit marker", async () => {
    const controlTable = createMutableControlTable({
      desiredRevision: 4,
      publishedRevision: 4,
      syncStatus: "ready"
    });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlTable.publicCatalogControl
    };

    const result = await markPublicCatalogDirty(tx as never, "site.publish", {
      actorUserId: "11111111-1111-4111-8111-111111111111",
      requestId: "req-dirty"
    });

    expect(result).toEqual({ desiredRevision: 5, marked: true });
    expect(tx.publicCatalogControl.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        desiredRevision: { increment: 1 },
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        syncStatus: "pending"
      })
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "public_catalog.dirty",
        entityType: "public_catalog",
        requestId: "req-dirty"
      })
    }));
  });

  it("accumulates two stale dirty writes as two durable revision increments", async () => {
    const state = control({
      desiredRevision: 10,
      publishedRevision: 10,
      syncStatus: "ready"
    });
    let readCount = 0;
    let releaseReads!: () => void;
    const allReadsCompleted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn(async () => {
          readCount += 1;
          if (readCount === 2) {
            releaseReads();
          }
          await allReadsCompleted;
          return control({
            desiredRevision: 10,
            publishedRevision: 10,
            syncStatus: "ready"
          });
        }),
        upsert: vi.fn(async (input) =>
          applyControlMutation(state, (input.update ?? input.create) as Record<string, unknown>)
        )
      }
    };

    await Promise.all([
      markPublicCatalogDirty(tx as never, "site.update", publicCatalogContext("req-dirty-a")),
      markPublicCatalogDirty(tx as never, "site.update", publicCatalogContext("req-dirty-b"))
    ]);

    expect(state).toMatchObject({
      desiredRevision: 12,
      publishedRevision: 10,
      syncStatus: "pending"
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale dirty write collapse behind a completed publish", async () => {
    const state = control({
      desiredRevision: 5,
      publishedRevision: 5,
      syncStatus: "ready"
    });
    let upsertCount = 0;
    let firstWriteStarted!: () => void;
    let releaseFirstWrite!: () => void;
    const firstWritePaused = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const resumeFirstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(control({
            desiredRevision: 5,
            publishedRevision: 5,
            syncStatus: "ready"
          }))
          .mockImplementation(async () => ({ ...state })),
        upsert: vi.fn(async (input) => {
          upsertCount += 1;
          if (upsertCount === 1) {
            firstWriteStarted();
            await resumeFirstWrite;
          }
          return applyControlMutation(state, (input.update ?? input.create) as Record<string, unknown>);
        })
      }
    };

    const staleDirty = markPublicCatalogDirty(
      tx as never,
      "site.update",
      publicCatalogContext("req-stale-dirty")
    );
    await firstWritePaused;
    Object.assign(state, control({
      desiredRevision: 6,
      publishedRevision: 6,
      syncStatus: "ready"
    }));
    await markPublicCatalogDirty(tx as never, "site.update", publicCatalogContext("req-later-dirty"));

    releaseFirstWrite();
    await staleDirty;

    expect(state.desiredRevision).toBeGreaterThan(state.publishedRevision);
    expect(state).toMatchObject({
      desiredRevision: 8,
      publishedRevision: 6,
      syncStatus: "pending"
    });
  });

  it("declares durable showDemoInModal in the Prisma model and owned migration", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "prisma/migrations/20260807120000_public_runtime_control/migration.sql",
      "utf8"
    );

    expect(schema).toContain('showDemoInModal            Boolean   @default(false) @map("show_demo_in_modal")');
    expect(migration).toContain('"show_demo_in_modal" boolean NOT NULL DEFAULT false');
  });

  it("reads durable showDemoInModal from the singleton control row", async () => {
    const prisma = {
      publicCatalogControl: {
        upsert: vi.fn().mockResolvedValue({
          ...control(),
          showDemoInModal: true
        })
      }
    };
    const repository = createPrismaPublicCatalogSyncRepository({ prisma: prisma as never });

    await expect(repository.readSettings()).resolves.toEqual({
      showDemoInModal: true
    });
  });

  it("updates durable showDemoInModal and marks the catalog dirty exactly once for a real change", async () => {
    for (const [beforeValue, nextValue] of [[false, true], [true, false]] as const) {
      const controlTable = createMutableControlTable({
        desiredRevision: 4,
        publishedRevision: 4,
        showDemoInModal: beforeValue,
        syncStatus: "ready"
      });
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        publicCatalogControl: controlTable.publicCatalogControl
      };

      const result = await updatePublicCatalogSettings(
        tx as never,
        { showDemoInModal: nextValue },
        { actorUserId: "11111111-1111-4111-8111-111111111111", requestId: `req-settings-${nextValue}` }
      );

      expect(result).toEqual({
        desiredRevision: 5,
        marked: true,
        settings: { showDemoInModal: nextValue }
      });
      expect(tx.publicCatalogControl.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.publicCatalogControl.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          desiredRevision: { increment: 1 },
          lastSyncErrorCode: null,
          lastSyncRequestId: null,
          showDemoInModal: nextValue,
          syncStatus: "pending"
        })
      }));
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: "public_catalog.dirty",
          afterJson: expect.objectContaining({
            desiredRevision: 5,
            reason: "settings.show_demo_in_modal"
          }),
          entityType: "public_catalog"
        })
      }));
    }
  });

  it("applies racing showDemoInModal changes against the committed current setting", async () => {
    const state = control({
      desiredRevision: 20,
      publishedRevision: 20,
      showDemoInModal: false,
      syncStatus: "ready"
    });
    let writeCount = 0;
    let firstWriteStarted!: () => void;
    let releaseFirstWrite!: () => void;
    const firstWritePaused = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const resumeFirstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    async function applySettingsWrite(input: {
      create?: Record<string, unknown>;
      data?: Record<string, unknown>;
      update?: Record<string, unknown>;
    }): Promise<PublicCatalogControlState | { count: number }> {
      writeCount += 1;
      if (writeCount === 1) {
        firstWriteStarted();
        await resumeFirstWrite;
      }
      const data = (input.data ?? input.update ?? input.create) as Record<string, unknown>;
      if (
        typeof data.showDemoInModal === "boolean" &&
        state.showDemoInModal === data.showDemoInModal
      ) {
        return { count: 0 };
      }
      return applyControlMutation(state, data);
    }
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(control({
            desiredRevision: 20,
            publishedRevision: 20,
            showDemoInModal: false,
            syncStatus: "ready"
          }))
          .mockImplementation(async () => ({ ...state })),
        updateMany: vi.fn((input) => applySettingsWrite(input)),
        upsert: vi.fn((input) => applySettingsWrite(input))
      }
    };

    const staleEnable = updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: true },
      publicCatalogContext("req-settings-stale-enable")
    );
    await firstWritePaused;
    await updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: true },
      publicCatalogContext("req-settings-enable")
    );
    await updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: false },
      publicCatalogContext("req-settings-disable")
    );

    releaseFirstWrite();
    await staleEnable;

    expect(state).toMatchObject({
      desiredRevision: 23,
      publishedRevision: 20,
      showDemoInModal: true,
      syncStatus: "pending"
    });
  });

  it("does not dirty the catalog for an idempotent showDemoInModal update", async () => {
    const controlTable = createMutableControlTable({ showDemoInModal: true });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlTable.publicCatalogControl
    };

    const result = await updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: true },
      { actorUserId: "11111111-1111-4111-8111-111111111111", requestId: "req-settings-noop" }
    );

    expect(result).toEqual({
      marked: false,
      reason: "unchanged",
      settings: { showDemoInModal: true }
    });
    expect(tx.publicCatalogControl.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("marks settings dirty during an active sync without destroying the current lease", async () => {
    const before = control({
      desiredRevision: 1,
      publishedRevision: 0,
      showDemoInModal: false,
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-current",
      syncStatus: "syncing"
    });
    const controlTable = createMutableControlTable(before);
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlTable.publicCatalogControl
    };

    const result = await updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: true },
      { actorUserId: "11111111-1111-4111-8111-111111111111", requestId: "req-settings-during-sync" }
    );
    const update = tx.publicCatalogControl.updateMany.mock.calls[0]![0].data;
    const finalized = finalizePublicCatalogLeaseState({
      ...before,
      desiredRevision: 2,
      showDemoInModal: true,
      syncStatus: "pending"
    }, {
      checksum: "c".repeat(64),
      generatedAt: now,
      itemsCount: 1,
      leaseId: "lease-current",
      publishedRevision: 1,
      publishedRuntimeTargetKey: primaryTargetKey(),
      requestId: "req-finalize-after-settings",
      snapshotPath: "catalog/v1/releases/revision-1-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.json"
    });

    expect(result).toMatchObject({
      desiredRevision: 2,
      marked: true,
      settings: { showDemoInModal: true }
    });
    expect(update).not.toHaveProperty("syncLeaseExpiresAt");
    expect(update).not.toHaveProperty("syncLeaseId");
    expect(finalized).toMatchObject({
      desiredRevision: 2,
      publishedRevision: 1,
      syncStatus: "pending"
    });
  });

  it("treats missing public_catalog_control during settings update as a safe staged-deploy no-op", async () => {
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn().mockRejectedValue(new Error("relation public_catalog_control does not exist")),
        updateMany: vi.fn().mockRejectedValue(new Error("relation public_catalog_control does not exist")),
        upsert: vi.fn().mockResolvedValue({})
      }
    };

    await expect(updatePublicCatalogSettings(
      tx as never,
      { showDemoInModal: true },
      { actorUserId: "11111111-1111-4111-8111-111111111111", requestId: "req-settings-missing-table" }
    )).resolves.toEqual({
      marked: false,
      reason: "control_table_missing",
      settings: { showDemoInModal: false }
    });

    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("treats exact missing public_catalog_control as the only safe dirty fallback", async () => {
    const missingControl = new Prisma.PrismaClientKnownRequestError(
      "relation public_catalog_control does not exist",
      {
        clientVersion: "test",
        code: "P2021",
        meta: { table: "public_catalog_control" }
      }
    );
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        upsert: vi.fn().mockRejectedValue(missingControl)
      }
    };

    await expect(markPublicCatalogDirty(
      tx as never,
      "site.update",
      publicCatalogContext("req-missing-control-dirty")
    )).resolves.toEqual({
      marked: false,
      reason: "control_table_missing"
    });

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("propagates unrelated P2021 and 42P01 errors instead of treating them as control-table absence", async () => {
    const unrelatedKnown = new Prisma.PrismaClientKnownRequestError(
      "relation audit_log does not exist",
      {
        clientVersion: "test",
        code: "P2021",
        meta: { table: "audit_log" }
      }
    );
    const txKnown = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        upsert: vi.fn().mockRejectedValue(unrelatedKnown)
      }
    };

    await expect(markPublicCatalogDirty(
      txKnown as never,
      "site.update",
      publicCatalogContext("req-unrelated-p2021")
    )).rejects.toBe(unrelatedKnown);

    const unrelatedMessage = new Error("42P01: relation audit_log does not exist");
    const txMessage = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        upsert: vi.fn().mockRejectedValue(unrelatedMessage)
      }
    };

    await expect(markPublicCatalogDirty(
      txMessage as never,
      "site.update",
      publicCatalogContext("req-unrelated-42p01")
    )).rejects.toBe(unrelatedMessage);
  });

  it("propagates unrelated audit write failures after a successful dirty control update", async () => {
    const controlTable = createMutableControlTable({
      desiredRevision: 4,
      publishedRevision: 4,
      syncStatus: "ready"
    });
    const auditError = new Error("42P01: relation audit_log does not exist");
    const tx = {
      auditLog: { create: vi.fn().mockRejectedValue(auditError) },
      publicCatalogControl: controlTable.publicCatalogControl
    };

    await expect(markPublicCatalogDirty(
      tx as never,
      "site.update",
      publicCatalogContext("req-audit-missing")
    )).rejects.toBe(auditError);
  });

  it("treats an unexpired active lease as controlled pending work without stealing it", async () => {
    const active = control({
      desiredRevision: 2,
      publishedRevision: 1,
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-owner",
      syncStatus: "syncing"
    });
    const prisma = {
      publicCatalogControl: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue(active)
      }
    };
    const repository = createPrismaPublicCatalogSyncRepository({ prisma: prisma as never });

    await expect(repository.acquireLease({
      leaseId: "lease-contender",
      now,
      targetKey: primaryTargetKey(),
      ttlMs: 60_000
    })).resolves.toBeNull();

    expect(prisma.publicCatalogControl.updateMany).not.toHaveBeenCalled();
  });

  it("fences an unexpired lease even when dirty marking left syncStatus pending", async () => {
    const active = control({
      desiredRevision: 2,
      publishedRevision: 1,
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-owner",
      syncStatus: "pending"
    });
    const prisma = {
      publicCatalogControl: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue(active)
      }
    };
    const repository = createPrismaPublicCatalogSyncRepository({ prisma: prisma as never });

    await expect(repository.acquireLease({
      leaseId: "lease-contender",
      now,
      targetKey: primaryTargetKey(),
      ttlMs: 60_000
    })).resolves.toBeNull();

    expect(prisma.publicCatalogControl.updateMany).not.toHaveBeenCalled();
  });

  it("does not finalize ready when a dirty revision races between finalize read and CAS update", async () => {
    let state = control({
      desiredRevision: 1,
      publishedRevision: 0,
      syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
      syncLeaseId: "lease-current",
      syncStatus: "syncing"
    });
    const prisma = {
      publicCatalogControl: {
        findUnique: vi.fn(async () => ({ ...state })),
        findUniqueOrThrow: vi.fn(async () => ({ ...state })),
        updateMany: vi.fn(async (input) => {
          state = {
            ...state,
            desiredRevision: 2,
            syncStatus: "pending"
          };
          if (!matchesControlWhere(state, input.where as Record<string, unknown>)) {
            return { count: 0 };
          }
          state = applyControlMutation(state, input.data as Record<string, unknown>);
          return { count: 1 };
        })
      }
    };
    const repository = createPrismaPublicCatalogSyncRepository({ prisma: prisma as never });

    await expect(repository.finalizeLease({
      checksum: "a".repeat(64),
      generatedAt: now,
      itemsCount: 1,
      leaseId: "lease-current",
      publishedRevision: 1,
      publishedRuntimeTargetKey: primaryTargetKey(),
      requestId: "req-finalize-race",
      snapshotPath: "catalog/v1/releases/revision-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
    })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_SYNC_CONFLICT",
      statusCode: 409
    });
    expect(state).toMatchObject({
      desiredRevision: 2,
      publishedRevision: 0,
      syncLeaseId: "lease-current",
      syncStatus: "pending"
    });
  });
});

function primaryTargetFixture(): PublicRuntimeTargetConfig {
  return {
    bucket: "web00-public-runtime",
    catalogVersion: "v1",
    manifestPath: "runtime/production/catalog/v1/manifest.json",
    prefix: "runtime/production",
    provider: "cloudru",
    publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru",
    role: "primary"
  };
}

function primaryTargetKey(): string {
  return createPublicRuntimeTargetKey(primaryTargetFixture());
}
