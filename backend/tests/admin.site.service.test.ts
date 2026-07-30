import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  assertCanUpdateSite,
  createAdminSiteService
} from "../src/modules/admin/sites/site.service.js";
import type { AdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import type { UpdateAdminSiteInput } from "../src/modules/admin/sites/site.types.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";

describe("admin site update permission helper", () => {
  it("allows editor draft content updates and denies editor published updates", () => {
    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "draft" }, {
        title: "Draft"
      })
    ).not.toThrow();

    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "published" }, {
        title: "Published"
      })
    ).toThrow(AppError);
  });

  it("requires site.updateAny for featured updates", () => {
    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "draft" }, {
        featured: true
      } as UpdateAdminSiteInput)
    ).toThrow(AppError);
    expect(() =>
      assertCanUpdateSite(adminPrincipal(), { deletedAt: null, status: "published" }, {
        featured: true
      } as UpdateAdminSiteInput)
    ).not.toThrow();
  });

  it("requires a preview before publishing", () => {
    const error = new AppError({
      code: "SITE_PREVIEW_REQUIRED",
      message: "Site preview is required.",
      statusCode: 409
    });

    expect(error.code).toBe("SITE_PREVIEW_REQUIRED");
  });

  it("blocks permanent delete while a soft-deleted site still has attached images", async () => {
    for (const site of [
      siteRecord({
        galleryImages: [],
        previewImageUrl: "https://storage.example.test/preview.webp"
      }),
      siteRecord({
        galleryImages: [{ assetId: "gallery-1" }],
        previewImageUrl: null
      }),
      siteRecord({
        galleryImages: [{ assetId: "gallery-1" }],
        previewImageUrl: "https://storage.example.test/preview.webp"
      })
    ]) {
      const repository = createRepository(site);
      const service = createAdminSiteService({ repository });

      await expect(
        service.permanentlyDeleteSite(site.id, mutationContext())
      ).rejects.toMatchObject({
        code: "SITE_IMAGES_ATTACHED",
        message: "Перед окончательным удалением удалите preview и gallery."
      });
      expect(repository.permanentlyDeleteSite).not.toHaveBeenCalled();
    }
  });

  it("allows permanent delete after preview and gallery have been cleaned up", async () => {
    const site = siteRecord({
      galleryImages: [],
      previewImageUrl: null
    });
    const repository = createRepository(site);
    const service = createAdminSiteService({ repository });

    await expect(
      service.permanentlyDeleteSite(site.id, mutationContext())
    ).resolves.toBeUndefined();

    expect(repository.permanentlyDeleteSite).toHaveBeenCalledWith(site.id, mutationContext());
  });
});

function editorPrincipal(): AuthenticatedPrincipal {
  return {
    email: "editor@example.com",
    id: "00000000-0000-4000-8000-000000000001",
    role: "editor",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}

function adminPrincipal(): AuthenticatedPrincipal {
  return {
    ...editorPrincipal(),
    email: "admin@example.com",
    role: "admin"
  };
}

function mutationContext() {
  return {
    actor: adminPrincipal(),
    now: new Date("2026-07-30T00:00:00.000Z"),
    requestId: "req_permanent_delete"
  };
}

function createRepository(site: ReturnType<typeof siteRecord>): AdminSiteRepository {
  return {
    createDraft: vi.fn(),
    getSite: vi.fn(async () => site),
    listSites: vi.fn(),
    permanentlyDeleteSite: vi.fn(async () => undefined),
    publishSite: vi.fn(),
    restoreSite: vi.fn(),
    softDeleteSite: vi.fn(),
    unpublishSite: vi.fn(),
    updateSite: vi.fn()
  } as unknown as AdminSiteRepository;
}

function siteRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: false,
    category: {
      id: "00000000-0000-4000-8000-000000000010",
      slug: "services",
      title: "Services"
    },
    categoryId: "00000000-0000-4000-8000-000000000010",
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    deletedAt: new Date("2026-07-30T00:00:00.000Z"),
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: null,
    featured: false,
    features: [],
    fullDescription: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: null,
    previewType: null,
    priceAmountCents: null,
    priceLabel: null,
    publishedAt: null,
    shortDescription: "Short",
    siteUrl: null,
    slug: "deleted-site",
    sortOrder: 0,
    status: "draft",
    tags: [],
    title: "Deleted site",
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    views: 0,
    ...overrides
  };
}
