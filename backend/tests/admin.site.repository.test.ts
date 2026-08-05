import { describe, expect, it, vi } from "vitest";

import {
  createAdminSiteListWhere,
  createPrismaAdminSiteRepository
} from "../src/modules/admin/sites/site.repository.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import type { AdminSiteRecord } from "../src/modules/admin/sites/site.types.js";

describe("admin site repository query helpers", () => {
  it("includes slug in admin site search for post-network-failure verification", () => {
    expect(createAdminSiteListWhere({
      deleted: "without",
      direction: "desc",
      limit: 20,
      page: 1,
      search: "magazin-odezhdy-test",
      sort: "updatedAt"
    }, true)).toMatchObject({
      deletedAt: null,
      OR: [
        { title: { contains: "magazin-odezhdy-test", mode: "insensitive" } },
        { shortDescription: { contains: "magazin-odezhdy-test", mode: "insensitive" } },
        { slug: { contains: "magazin-odezhdy-test", mode: "insensitive" } }
      ]
    });
  });

  it("does not dirty the public catalog for a published no-op site update", async () => {
    const site = siteRecord();
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn()
      },
      site: {
        findUnique: vi.fn().mockResolvedValue(site),
        update: vi.fn().mockResolvedValue({
          ...site,
          updatedAt: new Date("2026-08-01T12:05:00.000Z")
        })
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

    await repository.updateSite(site.id, { title: site.title }, adminContext());

    expect(tx.publicCatalogControl.findUnique).not.toHaveBeenCalled();
    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });

  it("records nullable audit actor ids for Direct Pages system recovery lifecycle mutations", async () => {
    const before = siteRecord();
    const after = siteRecord({
      publishedAt: null,
      status: "draft"
    });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({})
      },
      site: {
        findUnique: vi.fn().mockResolvedValue(before),
        findUniqueOrThrow: vi.fn().mockResolvedValue(after),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

    await repository.unpublishSite(before.id, systemRecoveryContext());

    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "site.unpublish",
        actorUserId: null
      })
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "public_catalog.dirty",
        actorUserId: null
      })
    }));
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
    requestId: "req_admin_site_noop"
  };
}

function systemRecoveryContext(): AdminMutationContext {
  return {
    actor: {
      email: "system@web00.local",
      id: "00000000-0000-4000-8000-000000000901",
      role: "admin",
      sessionId: "00000000-0000-4000-8000-000000000902",
      tokenId: "00000000-0000-4000-8000-000000000903"
    },
    now: new Date("2026-08-05T12:00:00.000Z"),
    requestId: "00000000-0000-4000-8000-000000002310"
  };
}

function siteRecord(overrides: Partial<AdminSiteRecord> = {}): AdminSiteRecord {
  return {
    active: true,
    category: {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "business",
      title: "Business"
    },
    categoryId: "22222222-2222-4222-8222-222222222222",
    createdAt: new Date("2026-08-01T11:00:00.000Z"),
    deletedAt: null,
    deliveryLabel: "7 days",
    demoLocalUrl: null,
    demoMode: "external",
    demoUrl: "https://prudexxx.github.io/web00-pro/demo.html",
    developmentDays: 7,
    externalDemoUrl: null,
    featured: false,
    features: ["Responsive"],
    fullDescription: "Full description",
    galleryImages: [],
    id: "33333333-3333-4333-8333-333333333333",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: "https://prudexxx.github.io/web00-pro/assets/preview.webp",
    previewType: "image",
    priceAmountCents: 100000,
    priceLabel: "from 1000",
    publishedAt: new Date("2026-08-01T11:30:00.000Z"),
    shortDescription: "Short description",
    siteUrl: "https://example.test",
    slug: "published-site",
    sortOrder: 1,
    status: "published",
    tags: ["tag"],
    title: "Published Site",
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    views: 42,
    ...overrides
  };
}
