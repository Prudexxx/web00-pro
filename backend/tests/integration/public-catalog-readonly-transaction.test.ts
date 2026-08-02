import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertTestDatabaseUrl,
  parseDatabaseUrl,
  parseTestDatabaseEnv
} from "../../src/config/database-env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { PUBLIC_CATALOG_CONTROL_ID } from "../../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  withPublicCatalogReadOnlyTransaction
} from "../../src/modules/public-catalog/public-catalog-readonly-transaction.js";

let prisma: PrismaClient;

beforeAll(() => {
  const databaseEnv = parseTestDatabaseEnv(process.env);

  assertTestDatabaseUrl(databaseEnv);
  assertAp0StrictTestDatabaseUrl(databaseEnv.TEST_DATABASE_URL);
  prisma = createPrismaClient({
    databaseUrl: databaseEnv.TEST_DATABASE_URL
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("public catalog read-only transaction", () => {
  it("exposes only AP0 read delegates to the callback at runtime", async () => {
    await withPublicCatalogReadOnlyTransaction(prisma, async (tx) => {
      expect(Object.keys(tx).sort()).toEqual(["publicCatalogControl", "site"]);
      expect("$queryRaw" in tx).toBe(false);
      expect("$executeRaw" in tx).toBe(false);
      expect("$executeRawUnsafe" in tx).toBe(false);
      expect("auditLog" in tx).toBe(false);
      expect("storageCleanupJob" in tx).toBe(false);
      expect(Object.keys(tx.publicCatalogControl).sort()).toEqual(["findUnique"]);
      expect(Object.keys(tx.site).sort()).toEqual(["findMany"]);

      await expect(
        tx.publicCatalogControl.findUnique({
          select: {
            currentItemsCount: true,
            currentSnapshotChecksum: true,
            currentSnapshotPath: true,
            desiredRevision: true,
            id: true,
            lastSyncErrorCode: true,
            lastSyncRequestId: true,
            publishedRevision: true,
            showDemoInModal: true,
            syncLeaseExpiresAt: true,
            syncLeaseId: true,
            syncStatus: true
          },
          where: { id: PUBLIC_CATALOG_CONTROL_ID }
        })
      ).resolves.toBeDefined();
    });
  });

  it("sends SET TRANSACTION READ ONLY before callback repository access", async () => {
    const calls: string[] = [];
    const tx = {
      $executeRawUnsafe: vi.fn(async (query: string) => {
        calls.push(query);
      }),
      publicCatalogControl: {
        findUnique: vi.fn(async () => {
          calls.push("publicCatalogControl.findUnique");
          return null;
        })
      },
      site: {
        findMany: vi.fn(async () => {
          calls.push("site.findMany");
          return [];
        })
      }
    };
    const prismaLike = {
      $transaction: vi.fn(
        async (
          operation: (transaction: typeof tx) => Promise<unknown>,
          options: { isolationLevel: Prisma.TransactionIsolationLevel }
        ) => {
        expect(options).toEqual({
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
        });
        return operation(tx);
        }
      )
    } as unknown as PrismaClient;

    await withPublicCatalogReadOnlyTransaction(prismaLike, async (readOnlyTx) => {
      await readOnlyTx.publicCatalogControl.findUnique({
        select: {
          currentItemsCount: true,
          currentSnapshotChecksum: true,
          currentSnapshotPath: true,
          desiredRevision: true,
          id: true,
          lastSyncErrorCode: true,
          lastSyncRequestId: true,
          publishedRevision: true,
          showDemoInModal: true,
          syncLeaseExpiresAt: true,
          syncLeaseId: true,
          syncStatus: true
        },
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      });
    });

    expect(calls).toEqual([
      "SET TRANSACTION READ ONLY",
      "publicCatalogControl.findUnique"
    ]);
  });

  it("proves PostgreSQL read-only mode rejects writes with SQLSTATE 25006", async () => {
    const before = await prisma.publicCatalogControl.findUnique({
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    });

    let caught: unknown;
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          const rows = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>(
          "SHOW transaction_read_only"
          );
          expect(rows[0]?.transaction_read_only).toBe("on");

          await tx.$executeRawUnsafe(
            "UPDATE public_catalog_control SET desired_revision = desired_revision WHERE false"
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      );
    } catch (error) {
      caught = error;
    }

    const caughtText =
      caught instanceof Error ? `${caught.name} ${caught.message}` : JSON.stringify(caught);
    expect(caughtText).toContain("25006");
    const after = await prisma.publicCatalogControl.findUnique({
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    });
    expect(after).toEqual(before);
  });
});

function assertAp0StrictTestDatabaseUrl(databaseUrl: string): void {
  const parsed = parseDatabaseUrl(databaseUrl, "TEST_DATABASE_URL");
  if (
    parsed.host !== "127.0.0.1" ||
    parsed.port !== "5433" ||
    parsed.database !== "web00_backend_test"
  ) {
    throw new Error("AP0 local database guard rejected target.");
  }
}
