import { describe, expect, it, vi } from "vitest";

import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import { createPrismaAdminCategoryRepository } from "../src/modules/admin/categories/category.repository.js";
import type { AdminCategoryRecord } from "../src/modules/admin/categories/category.types.js";

describe("admin category repository public catalog dirty tracking", () => {
  it("does not dirty the public catalog for a no-op category update", async () => {
    const category = categoryRecord();
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      category: {
        findUnique: vi.fn().mockResolvedValue(category),
        update: vi.fn().mockResolvedValue({
          ...category,
          updatedAt: new Date("2026-08-01T12:05:00.000Z")
        })
      },
      publicCatalogControl: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn()
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const repository = createPrismaAdminCategoryRepository({ prisma: prisma as never });

    await repository.updateCategory(category.id, { title: category.title }, adminContext());

    expect(tx.publicCatalogControl.findUnique).not.toHaveBeenCalled();
    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });
});

function adminContext(): AdminMutationContext {
  return {
    actor: {
      email: "owner@example.test",
      id: "11111111-1111-4111-8111-111111111111",
      role: "admin",
      sessionId: "11111111-1111-4111-8111-111111111112",
      tokenId: "11111111-1111-4111-8111-111111111113"
    },
    now: new Date("2026-08-01T12:00:00.000Z"),
    requestId: "req_admin_category_noop"
  };
}

function categoryRecord(overrides: Partial<AdminCategoryRecord> = {}): AdminCategoryRecord {
  return {
    active: true,
    createdAt: new Date("2026-08-01T11:00:00.000Z"),
    description: "Business category",
    id: "22222222-2222-4222-8222-222222222222",
    slug: "business",
    sortOrder: 1,
    title: "Business",
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides
  };
}
