import { describe, expect, it } from "vitest";
import type { ManagedImageUrlPolicy } from "../src/modules/images/image.types.js";
import {
  preparePublicCatalogSnapshotCandidate
} from "../src/modules/public-catalog/public-catalog-snapshot-preparation.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";

describe("public catalog snapshot preparation", () => {
  it("builds deterministic ready internal result from records and settings only", async () => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [createProjectionRecord()],
      revision: 7,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("Expected ready preparation result.");
    }
    expect(result).toMatchObject({
      byteLength: expect.any(Number),
      itemsCount: 1,
      revision: 7
    });
    expect(result.built.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.built.bytes).toContain("\"dom-dlya-busi\"");
  });

  it("returns safe duplicate slug blockers for each conflicting card", async () => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord({ id: "00000000-0000-4000-8000-000000000201", slug: "duplicate" }),
        createProjectionRecord({ id: "00000000-0000-4000-8000-000000000202", slug: "duplicate" })
      ],
      revision: 8,
      settings: { showDemoInModal: false }
    });

    expect(result).toMatchObject({
      blockersTruncated: false,
      byteLength: null,
      itemsCount: 2,
      revision: 8,
      sha256: null,
      status: "blocked"
    });
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        reasonCode: "DUPLICATE_SLUG",
        siteId: "00000000-0000-4000-8000-000000000201"
      }),
      expect.objectContaining({
        reasonCode: "DUPLICATE_SLUG",
        siteId: "00000000-0000-4000-8000-000000000202"
      })
    ]);
  });

  it("returns exact safe URL blockers without raw credentialed URLs", async () => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord({
          demoUrl: "https://user:pass@example.test/demo",
          previewImageUrl: "https://example.test/preview.png#secret"
        })
      ],
      revision: 9,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath: "demoUrl",
        reasonCode: "INVALID_URL_CREDENTIALS"
      }),
      expect.objectContaining({
        fieldPath: "previewImageUrl",
        reasonCode: "INVALID_URL_FRAGMENT"
      })
    ]);
    expect(JSON.stringify(result)).not.toMatch(/user:pass|#secret|postgres:\/\/|service_role|token|password/i);
  });

  it.each([
    ["demoUrl", { demoUrl: "https://example.test/demo?token=secret" }],
    ["siteUrl", { siteUrl: "https://example.test/site?token=secret" }],
    [
      "previewImageUrl",
      { previewImageUrl: "https://cdn.example.test/preview.png?token=secret" }
    ],
    [
      "galleryImages[0].url",
      {
        galleryImages: [
          {
            alt: "Gallery",
            sortOrder: 0,
            storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
            url: "https://cdn.example.test/gallery.png?token=secret"
          }
        ]
      }
    ]
  ])("returns a safe blocker for query-bearing %s", async (fieldPath, overrides) => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [createProjectionRecord(overrides)],
      revision: 11,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath,
        reasonCode: "INVALID_URL_QUERY"
      })
    ]);
    expect(JSON.stringify(result)).not.toMatch(/token=secret|\?token/i);
  });

  it.each([
    ["previewImageUrl", "assets/img/preview.png?token=secret"],
    ["previewImageUrl", "./assets/img/preview.png?token=secret"],
    ["previewImageUrl", "/web00-pro/assets/img/preview.png?token=secret"],
    ["galleryImages[0].url", "assets/img/gallery.png?token=secret"],
    ["galleryImages[0].url", "./assets/img/gallery.png?token=secret"],
    ["galleryImages[0].url", "/web00-pro/assets/img/gallery.png?token=secret"]
  ])("returns INVALID_URL_QUERY for legacy asset %s query path", async (fieldPath, url) => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord(
          fieldPath === "previewImageUrl"
            ? { previewImageUrl: url }
            : {
                galleryImages: [
                  {
                    alt: "Gallery",
                    sortOrder: 0,
                    storagePath:
                      "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
                    url
                  }
                ]
              }
        )
      ],
      revision: 13,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath,
        reasonCode: "INVALID_URL_QUERY"
      })
    ]);
    expect(JSON.stringify(result)).not.toMatch(/token=secret|\?token/i);
  });

  it.each([
    [
      "missing alt",
      {
        sortOrder: 0,
        storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
        url: "https://cdn.example.test/gallery.png"
      },
      "galleryImages[0].alt"
    ],
    [
      "negative sort order",
      {
        alt: "Gallery",
        sortOrder: -1,
        storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
        url: "https://cdn.example.test/gallery.png"
      },
      "galleryImages[0].sortOrder"
    ],
    [
      "missing storage path",
      {
        alt: "Gallery",
        sortOrder: 0,
        url: "https://cdn.example.test/gallery.png"
      },
      "galleryImages[0].storagePath"
    ],
    [
      "invalid asset id",
      {
        alt: "Gallery",
        assetId: "not-a-uuid",
        sortOrder: 0,
        storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
        url: "https://cdn.example.test/gallery.png"
      },
      "galleryImages[0].assetId"
    ]
  ])("returns INVALID_IMAGE_DESCRIPTOR for %s", async (_label, galleryImage, fieldPath) => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord({
          galleryImages: [galleryImage]
        })
      ],
      revision: 12,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath,
        reasonCode: "INVALID_IMAGE_DESCRIPTOR"
      })
    ]);
  });

  it("does not turn arbitrary mapper failures into blocked content results", async () => {
    const throwingPolicy: ManagedImageUrlPolicy = {
      buildVariants: () => {
        throw new Error("unexpected image policy failure token=secret");
      },
      parseManagedGallery: () => null,
      parseManagedPreview: () => ({
        assetId: "00000000-0000-4000-8000-000000000301",
        siteId: "00000000-0000-4000-8000-000000000101",
        slot: "preview",
        storagePath: "catalog/site/preview.png",
        url: "https://cdn.example.test/catalog/site/preview.png",
        widths: [640]
      })
    };

    await expect(
      preparePublicCatalogSnapshotCandidate({
        generatedAt: new Date("2026-08-02T04:00:00.000Z"),
        imageUrlPolicy: throwingPolicy,
        records: [
          createProjectionRecord({
            previewImageUrl: "https://cdn.example.test/catalog/site/preview.png"
          })
        ],
        revision: 10,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/unexpected image policy failure/);
  });
});

export function createProjectionRecord(
  overrides: Partial<PublicSiteRecord> = {}
): PublicSiteRecord {
  return {
    category: { slug: "business", title: "Business" },
    deliveryLabel: "14 days",
    demoMode: null,
    demoUrl: null,
    developmentDays: 14,
    featured: false,
    features: ["CRM"],
    fullDescription: "Full description",
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    previewImageUrl: null,
    previewType: "image",
    priceAmountCents: 120000,
    priceLabel: "from 1200",
    publishedAt: new Date("2026-08-02T04:00:00.000Z"),
    shortDescription: "Short description",
    siteUrl: null,
    slug: "dom-dlya-busi",
    tags: ["crm"],
    title: "Дом для Буси",
    ...overrides
  } satisfies PublicSiteRecord;
}
