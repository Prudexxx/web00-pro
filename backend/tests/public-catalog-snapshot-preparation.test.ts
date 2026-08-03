import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapSiteToPublicCatalogItem } from "../src/modules/public-catalog/public-catalog.mapper.js";
import {
  buildPublicCatalogSnapshot
} from "../src/modules/public-catalog/public-catalog.snapshot.js";
import {
  PublicCatalogSnapshotPreparationSystemError,
  preparePublicCatalogSnapshotCandidate,
  runPreparationStage,
  verifyPublicCatalogSnapshotExactBytes
} from "../src/modules/public-catalog/public-catalog-snapshot-preparation.js";
import type { PublicCatalogDryRunStage } from "../src/modules/public-catalog/public-catalog-dry-run.types.js";
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

  it("keeps AP0 preparation byte-identical with the existing no-policy mapper and builder", async () => {
    const generatedAt = new Date("2026-08-02T04:00:00.000Z");
    const settings = { showDemoInModal: true };
    const records = [
      createProjectionRecord({ slug: "z-site", title: "Z" }),
      createProjectionRecord({ slug: "a-site", title: "A" })
    ];
    const expected = await buildPublicCatalogSnapshot({
      generatedAt,
      items: records.map((record) => mapSiteToPublicCatalogItem(record)),
      revision: 21,
      settings
    });

    const prepared = await preparePublicCatalogSnapshotCandidate({
      generatedAt,
      records,
      revision: 21,
      settings
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error("Expected ready preparation result.");
    }
    expect(prepared.built.bytes).toBe(expected.bytes);
    expect(prepared.built.sha256).toBe(expected.sha256);
    expect(prepared.built.sha256).toBe(
      createHash("sha256").update(prepared.built.bytes, "utf8").digest("hex")
    );
    expect(JSON.parse(prepared.built.bytes)).toMatchObject({
      itemsCount: 2,
      revision: 21,
      settings
    });
  });

  it("prepares a catalog card with a normalized null demo URL", async () => {
    const record = createProjectionRecord({
      demoUrl: null,
      slug: "null-demo-url",
      title: "Null demo URL"
    });
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [record],
      revision: 22,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("Expected normalized null demo URL to prepare a card.");
    }
    expect(result.built.snapshot.items).toEqual([
      expect.objectContaining({ demoUrl: null, slug: "null-demo-url", title: "Null demo URL" })
    ]);
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
  ])("does not block legacy raw asset %s query paths that the mapper drops", async (fieldPath, url) => {
    const generatedAt = new Date("2026-08-02T04:00:00.000Z");
    const settings = { showDemoInModal: false };
    const record = createProjectionRecord(
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
    );
    const expected = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [mapSiteToPublicCatalogItem(record)],
      revision: 13,
      settings
    });
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt,
      records: [record],
      revision: 13,
      settings
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("Expected legacy raw asset query path to follow mapper normalization.");
    }
    expect(result.built.bytes).toBe(expected.bytes);
    expect(result.built.snapshot.items[0]?.previewImageUrl).toBeNull();
    expect(result.built.snapshot.items[0]?.galleryImages).toEqual([]);
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

  it("reports malformed gallery descriptors as mapper-contract blockers", async () => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord({
          galleryImages: [
            {
              sortOrder: 0,
              storagePath:
                "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
              url: "https://cdn.example.test/gallery.png"
            }
          ]
        })
      ],
      revision: 22,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath: "galleryImages[0].alt",
        reasonCode: "INVALID_IMAGE_DESCRIPTOR",
        siteId: "00000000-0000-4000-8000-000000000101",
        stage: "item_map"
      })
    ]);
  });

  it("does not create AP0-only blockers for raw preview or gallery URLs the mapper drops", async () => {
    const generatedAt = new Date("2026-08-02T04:00:00.000Z");
    const settings = { showDemoInModal: false };
    const record = createProjectionRecord({
      galleryImages: [
        {
          alt: "Gallery",
          sortOrder: 0,
          storagePath: "sites/00000000-0000-4000-8000-000000000101/gallery/hero.png",
          url: "not-a-public-url"
        }
      ],
      previewImageUrl: "not-a-public-url"
    });
    const expected = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [mapSiteToPublicCatalogItem(record)],
      revision: 23,
      settings
    });

    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt,
      records: [record],
      revision: 23,
      settings
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("Expected unresolved raw asset URLs to follow mapper normalization.");
    }
    expect(result.built.bytes).toBe(expected.bytes);
    expect(result.built.snapshot.items[0]?.previewImageUrl).toBeNull();
    expect(result.built.snapshot.items[0]?.galleryImages).toEqual([]);
  });

  it("does not create AP0-only blockers for empty display fields accepted by the old builder", async () => {
    const generatedAt = new Date("2026-08-02T04:00:00.000Z");
    const settings = { showDemoInModal: false };
    const record = createProjectionRecord({
      category: { slug: "business", title: "" },
      shortDescription: "",
      title: ""
    });
    const expected = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [mapSiteToPublicCatalogItem(record)],
      revision: 24,
      settings
    });

    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt,
      records: [record],
      revision: 24,
      settings
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("Expected empty display fields to remain non-normative diagnostics.");
    }
    expect(result.built.bytes).toBe(expected.bytes);
  });

  it("reports query-bearing mapped URLs rejected by the existing snapshot validator", async () => {
    const result = await preparePublicCatalogSnapshotCandidate({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      records: [
        createProjectionRecord({
          demoUrl: "https://example.test/demo?token=secret"
        })
      ],
      revision: 25,
      settings: { showDemoInModal: false }
    });

    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" ? result.blockers : []).toEqual([
      expect.objectContaining({
        fieldPath: "demoUrl",
        reasonCode: "INVALID_URL_QUERY",
        stage: "item_validate"
      })
    ]);
    expect(JSON.stringify(result)).not.toMatch(/token=secret|\?token/i);
  });

  it.each([
    "item_map",
    "item_validate",
    "catalog_validate",
    "serialize",
    "size_validate",
    "hash",
    "final_parse_validate"
  ] as const)("wraps unknown preparation failures with exact %s stage", async (stage) => {
    await expect(
      runPreparationStage(stage, () => {
        throw new Error(`raw failure token=secret at ${stage}`);
      })
    ).rejects.toMatchObject({
      causeClass: "Error",
      stage
    });

    try {
      await runPreparationStage(stage, () => {
        throw new Error("raw failure token=secret");
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PublicCatalogSnapshotPreparationSystemError);
      expect(JSON.stringify(error)).not.toMatch(/raw failure|token=secret/i);
    }
  });

  it("reports final exact-byte parse validation failures with the final_parse_validate stage", async () => {
    const settings = { showDemoInModal: false };
    const built = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-02T04:00:00.000Z"),
      items: [mapSiteToPublicCatalogItem(createProjectionRecord())],
      revision: 26,
      settings
    });
    const corruptedBytes = built.bytes.replace("\"itemsCount\":1", "\"itemsCount\":2");

    await expect(verifyPublicCatalogSnapshotExactBytes({
      bytes: corruptedBytes,
      expectedItemsCount: 1,
      expectedRevision: 26,
      expectedSettings: settings,
      sha256: createHash("sha256").update(corruptedBytes, "utf8").digest("hex")
    })).rejects.toMatchObject({
      stage: "final_parse_validate"
    });
  });

  it("reports injected exact-byte hash failures with the hash stage", async () => {
    await expect(runPreparationStage("hash", () => {
      throw new Error("hash provider leaked token=secret");
    })).rejects.toMatchObject({
      stage: "hash"
    });
  });

  it("wraps pre-mapper input failures with the item_map stage", async () => {
    const record = createProjectionRecord();
    Object.defineProperty(record, "galleryImages", {
      get() {
        throw new Error("pre-mapper gallery failure token=secret");
      }
    });

    let caught: unknown;
    try {
      await preparePublicCatalogSnapshotCandidate({
        generatedAt: new Date("2026-08-02T04:00:00.000Z"),
        records: [record],
        revision: 10,
        settings: { showDemoInModal: false }
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PublicCatalogSnapshotPreparationSystemError);
    expect(caught).toMatchObject({
      causeClass: "Error",
      stage: "item_map"
    });
    expect(JSON.stringify(caught)).not.toMatch(/pre-mapper gallery|token=secret|password/i);
  });

  it("does not turn arbitrary mapper failures into blocked content results", async () => {
    const category = Object.defineProperties({}, {
      slug: {
        get() {
          throw new Error("unexpected mapper failure token=secret");
        }
      },
      title: {
        value: "Business"
      }
    }) as PublicSiteRecord["category"];

    await expect(
      preparePublicCatalogSnapshotCandidate({
        generatedAt: new Date("2026-08-02T04:00:00.000Z"),
        records: [
          createProjectionRecord({
            category
          })
        ],
        revision: 10,
        settings: { showDemoInModal: false }
      })
    ).rejects.toMatchObject({
      causeClass: "Error",
      stage: "item_map"
    });
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
