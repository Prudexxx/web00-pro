import { describe, expect, it, vi } from "vitest";
import catalog from "../prisma/seed-data/web00-catalog.json" with { type: "json" };
import {
  CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
  CANONICAL_LEGACY_ASSET_TARGET_SLUGS,
  formatCanonicalAssetReconciliationReport,
  reconcileCanonicalLegacyAssets,
  ReconciliationStateChangedError,
  type CanonicalLegacyAssetTargetSlug,
  type CanonicalAssetReconciliationRepository,
  type CanonicalAssetReconciliationSite
} from "../src/modules/admin/sites/canonical-asset-reconciliation.js";
import {
  runCanonicalLegacyAssetReconciliationCommand
} from "../src/cli/reconcile-canonical-legacy-assets.js";

const requestId = "req_canonical_asset_reconciliation_test";
const operationContext = {
  actorUserId: null,
  ipHash: null,
  requestId,
  userAgentHash: null
};

interface FakeAuditRow {
  action: string;
  afterJson: unknown;
  beforeJson: unknown;
  entityId: string;
  entityType: string;
  requestId: string;
}

describe("canonical legacy asset reconciliation", () => {
  it("dry run performs zero update/audit and reports planned changes", async () => {
    const repo = createFakeRepository();

    const report = await reconcileCanonicalLegacyAssets({
      catalog,
      context: operationContext,
      repository: repo
    });

    expect(report.mode).toBe("dry-run");
    expect(report.status).toBe("ready");
    expect(report.totals.plannedPreviewUpdates).toBe(3);
    expect(report.totals.plannedGalleryUrlUpdates).toBe(12);
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it.each([
    ["null preview", "mebel", null, "missing", true, null],
    ["exact canonical absolute preview", "mebel", canonicalPreviewFor("mebel"), "already-canonical", false, null],
    ["bare legacy preview path", "mebel", "assets/img/previews/mebel-home.png", "legacy-canonical", true, null],
    ["dot-prefixed legacy preview path", "massage", "./assets/img/previews/massage-home.png", "legacy-canonical", true, null],
    ["web00-prefixed legacy preview path", "drova", "/web00-pro/assets/img/previews/drova-home.png", "legacy-canonical", true, null],
    ["legacy preview resolving to another canonical asset", "mebel", "assets/img/previews/drova-home.png", "blocked", false, "PREVIEW_URL_CONFLICT:mebel"],
    ["unrelated managed absolute preview", "mebel", "https://storage.example.test/unexpected.webp", "blocked", false, "PREVIEW_URL_CONFLICT:mebel"],
    ["javascript preview", "mebel", "javascript:alert(1)", "blocked", false, "PREVIEW_URL_CONFLICT:mebel"],
    ["data preview", "mebel", "data:image/png;base64,AAAA", "blocked", false, "PREVIEW_URL_CONFLICT:mebel"],
    ["traversal preview", "mebel", "assets/img/previews/../drova-home.png", "blocked", false, "PREVIEW_URL_CONFLICT:mebel"]
  ] as const)("%s reports precise preview planning state", async (
    _label,
    slug,
    previewImageUrl,
    expectedState,
    expectedPlannedPreviewUpdate,
    expectedBlocker
  ) => {
    const repo = createFakeRepository({
      sites: replaceSite(slug, { previewImageUrl })
    });

    const report = await reconcileCanonicalLegacyAssets({
      catalog,
      context: operationContext,
      repository: repo
    });

    const target = targetFor(report, slug);
    expect(target.previewState).toBe(expectedState);
    expect(target.plannedPreviewUpdate).toBe(expectedPlannedPreviewUpdate);
    if (expectedBlocker === null) {
      expect(target.blockers).not.toContain(`PREVIEW_URL_CONFLICT:${slug}`);
    } else {
      expect(report.status).toBe("blocked");
      expect(target.blockers).toContain(expectedBlocker);
      expect(report.blockers).toContain(expectedBlocker);
    }
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("apply without confirm performs zero writes", async () => {
    const repo = createFakeRepository();

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("APPLY_CONFIRMATION_REQUIRED");
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("wrong confirm performs zero writes", async () => {
    const repo = createFakeRepository();

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: "wrong",
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("APPLY_CONFIRMATION_REQUIRED");
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("targets only the three approved canonical legacy slugs", async () => {
    const repo = createFakeRepository({
      sites: [
        ...createCanonicalSites(),
        {
          ...siteFixture({ slug: "mebel" }),
          id: "00000000-0000-4000-8000-000000000999",
          slug: "other-site",
          title: "Other Site"
        }
      ]
    });

    await reconcileCanonicalLegacyAssets({
      catalog,
      context: operationContext,
      repository: repo
    });

    expect(repo.lastRequestedSlugs).toEqual([...CANONICAL_LEGACY_ASSET_TARGET_SLUGS]);
  });

  it.each([
    ["missing site", () => createFakeRepository({ sites: createCanonicalSites().filter((site) => site.slug !== "drova") }), "SITE_MISSING:drova"],
    ["deleted site", () => createFakeRepository({ sites: replaceSite("mebel", { deletedAt: new Date("2026-07-30T00:00:00.000Z") }) }), "SITE_DELETED:mebel"],
    ["published site", () => createFakeRepository({ sites: replaceSite("mebel", { status: "published" }) }), "SITE_NOT_DRAFT:mebel"],
    ["inactive site", () => createFakeRepository({ sites: replaceSite("mebel", { active: false }) }), "SITE_INACTIVE:mebel"],
    ["category mismatch", () => createFakeRepository({ sites: replaceSite("mebel", { categorySlug: "services" }) }), "CATEGORY_MISMATCH:mebel"],
    ["gallery count mismatch", () => createFakeRepository({ sites: replaceSite("mebel", { galleryImages: galleryFor("mebel").slice(0, 3) }) }), "GALLERY_COUNT_MISMATCH:mebel"],
    ["unknown gallery URL", () => createFakeRepository({ sites: replaceSite("mebel", { galleryImages: galleryFor("mebel").map((image, index) => index === 0 ? { ...image, url: "https://evil.example.test/image.png" } : image) }) }), "GALLERY_URL_MISMATCH:mebel:0"],
    ["unexpected non-null preview", () => createFakeRepository({ sites: replaceSite("mebel", { previewImageUrl: "https://storage.example.test/unexpected.webp" }) }), "PREVIEW_URL_CONFLICT:mebel"]
  ])("%s blocks all apply writes", async (_label, createRepo, blocker) => {
    const repo = createRepo();

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain(blocker);
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("valid state sets three previews and normalizes twelve gallery URLs", async () => {
    const repo = createFakeRepository();

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("applied");
    expect(report.totals.appliedSiteUpdates).toBe(3);
    expect(report.totals.plannedPreviewUpdates).toBe(3);
    expect(report.totals.plannedGalleryUrlUpdates).toBe(12);
    for (const slug of CANONICAL_LEGACY_ASSET_TARGET_SLUGS) {
      const site = repo.site(slug);
      expect(site.previewImageUrl).toBe(`https://prudexxx.github.io/web00-pro/${sourceSite(slug).previewImageUrl}`);
      expect(site.galleryImages.map((image) => image.url)).toEqual(
        sourceSite(slug).galleryImages.map((image) => `https://prudexxx.github.io/web00-pro/${image.url}`)
      );
    }
  });

  it("production-like legacy previews dry-run as ready normalization work", async () => {
    const repo = createFakeRepository({
      sites: createProductionLikeLegacyPreviewSites()
    });

    const report = await reconcileCanonicalLegacyAssets({
      catalog,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.totals).toMatchObject({
      plannedGalleryUrlUpdates: 12,
      plannedPreviewUpdates: 3,
      targetSites: 3
    });
    for (const slug of CANONICAL_LEGACY_ASSET_TARGET_SLUGS) {
      expect(targetFor(report, slug)).toMatchObject({
        blockers: [],
        plannedPreviewUpdate: true,
        previewState: "legacy-canonical"
      });
    }
    expect(repo.writeAttempts).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("apply normalizes production-like legacy previews and twelve gallery URLs", async () => {
    const repo = createFakeRepository({
      sites: createProductionLikeLegacyPreviewSites()
    });

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("applied");
    expect(report.totals).toMatchObject({
      appliedSiteUpdates: 3,
      plannedGalleryUrlUpdates: 12,
      plannedPreviewUpdates: 3
    });
    for (const slug of CANONICAL_LEGACY_ASSET_TARGET_SLUGS) {
      const site = repo.site(slug);
      expect(site.previewImageUrl).toBe(canonicalPreviewFor(slug));
      expect(site.galleryImages.map((image) => image.url)).toEqual(
        sourceSite(slug).galleryImages.map((image) => `https://prudexxx.github.io/web00-pro/${image.url}`)
      );
    }
  });

  it("second apply after legacy preview normalization is already-reconciled", async () => {
    const repo = createFakeRepository({
      sites: createProductionLikeLegacyPreviewSites()
    });

    await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });
    const auditCount = repo.auditRows.length;
    const second = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(second.status).toBe("already-reconciled");
    expect(second.totals.plannedPreviewUpdates).toBe(0);
    expect(second.totals.plannedGalleryUrlUpdates).toBe(0);
    expect(repo.auditRows).toHaveLength(auditCount);
  });

  it("passes all three expected sites to apply in deterministic lock order before writing", async () => {
    const repo = createFakeRepository();

    await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(repo.lastExpectedSiteSlugs).toEqual(["drova", "massage", "mebel"]);
    expect(repo.events.slice(0, 6)).toEqual([
      "lock:drova",
      "lock:massage",
      "lock:mebel",
      "recheck:drova",
      "recheck:massage",
      "recheck:mebel"
    ]);
    expect(repo.events.findIndex((event) => event.startsWith("update:"))).toBeGreaterThan(
      repo.events.findIndex((event) => event === "recheck:mebel")
    );
  });

  it.each([
    ["title changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.title = "Changed title"; }],
    ["category changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.categorySlug = "services"; }],
    ["preview changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.previewImageUrl = "https://storage.example.test/race.webp"; }],
    ["gallery URL changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.galleryImages[0]!.url = "https://storage.example.test/race-gallery.webp"; }],
    ["gallery alt changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.galleryImages[0]!.alt = "Changed alt"; }],
    ["gallery order changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.galleryImages[0]!.sortOrder = 99; }],
    ["category relation changes after dry-run", (site: CanonicalAssetReconciliationSite) => { site.categoryId = "00000000-0000-4000-8000-000000000777"; }],
    ["site is published after dry-run", (site: CanonicalAssetReconciliationSite) => { site.status = "published"; site.publishedAt = "2026-07-31T12:00:00.000Z"; }],
    ["site is deleted after dry-run", (site: CanonicalAssetReconciliationSite) => { site.deletedAt = "2026-07-31T12:00:00.000Z"; }],
    ["site is disabled after dry-run", (site: CanonicalAssetReconciliationSite) => { site.active = false; }]
  ])("%s returns RECONCILIATION_STATE_CHANGED with zero reconciliation writes", async (_label, mutateSite) => {
    const repo = createFakeRepository({
      mutateBeforeApply: (sites) => {
        mutateSite(repo.site("mebel"));
        expect(sites).toBe(repo.sites);
      }
    });

    const report = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("RECONCILIATION_STATE_CHANGED");
    expect(report.message).toBe("Данные карточек изменились. Повторите проверку состояния.");
    expect(repo.mutationWrites).toBe(0);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("preserves assetId, storage metadata, alt/order, lifecycle fields, and identity fields", async () => {
    const repo = createFakeRepository();
    const before = snapshotSites(repo.sites);

    await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    for (const slug of CANONICAL_LEGACY_ASSET_TARGET_SLUGS) {
      const after = repo.site(slug);
      const original = before.get(slug);
      expect(original).toBeDefined();
      expect(after).toMatchObject({
        active: original?.active,
        categoryId: original?.categoryId,
        categorySlug: original?.categorySlug,
        deletedAt: original?.deletedAt,
        id: original?.id,
        publishedAt: original?.publishedAt,
        slug: original?.slug,
        status: original?.status,
        title: original?.title
      });
      expect(after.galleryImages.map(({ alt, assetId, sortOrder, storagePath, variants }) => ({
        alt,
        assetId,
        sortOrder,
        storagePath,
        variants
      }))).toEqual(
        original?.galleryImages.map(({ alt, assetId, sortOrder, storagePath, variants }) => ({
          alt,
          assetId,
          sortOrder,
          storagePath,
          variants
        }))
      );
    }
  });

  it("creates one safe audit entry per changed site", async () => {
    const repo = createFakeRepository();

    await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(repo.auditRows).toHaveLength(3);
    expect(repo.auditRows.map((row) => row.action)).toEqual([
      "site.reconcile_canonical_assets",
      "site.reconcile_canonical_assets",
      "site.reconcile_canonical_assets"
    ]);
    expect(repo.auditRows.every((row) => row.entityType === "site")).toBe(true);
    expect(repo.auditRows.every((row) => row.requestId === requestId)).toBe(true);
    expect(JSON.stringify(repo.auditRows)).not.toMatch(/DATABASE_URL|postgres:\/\/|postgresql:\/\/|token|cookie|password/i);
  });

  it("rolls back all three sites if the third site update/audit fails", async () => {
    const repo = createFakeRepository({ failOnChangeIndex: 2 });
    const before = snapshotSites(repo.sites);

    await expect(reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    })).rejects.toThrow("simulated write failure");

    expect(snapshotSites(repo.sites)).toEqual(before);
    expect(repo.auditRows).toHaveLength(0);
  });

  it("propagates unexpected apply failures instead of returning a blocked HTTP-success-shaped report", async () => {
    const repo = createFakeRepository({
      unexpectedApplyError: new Error("simulated unexpected transaction failure")
    });

    await expect(reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    })).rejects.toThrow("simulated unexpected transaction failure");

    expect(repo.auditRows).toHaveLength(0);
  });

  it("second apply after a successful apply is a no-op with no duplicate audit entries", async () => {
    const repo = createFakeRepository();

    await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });
    const auditCount = repo.auditRows.length;
    const second = await reconcileCanonicalLegacyAssets({
      apply: true,
      catalog,
      confirm: CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION,
      context: operationContext,
      repository: repo
    });

    expect(second.status).toBe("already-reconciled");
    expect(second.totals.plannedPreviewUpdates).toBe(0);
    expect(second.totals.plannedGalleryUrlUpdates).toBe(0);
    expect(repo.auditRows).toHaveLength(auditCount);
  });

  it("formats safe reports without raw secret or database material", async () => {
    const repo = createFakeRepository();
    const report = await reconcileCanonicalLegacyAssets({
      catalog,
      context: operationContext,
      repository: repo
    });

    expect(formatCanonicalAssetReconciliationReport(report)).not.toMatch(
      /DATABASE_URL|postgres:\/\/|postgresql:\/\/|secret|token|cookie|password|@localhost/i
    );
  });

  it("CLI refuses to connect without explicit DB env and does not leak secret-like env values", async () => {
    const terminal = createMemoryTerminal();

    const code = await runCanonicalLegacyAssetReconciliationCommand({
      argv: [],
      processEnv: {
        ACCESS_TOKEN: "do-not-print-token",
        PASSWORD: "do-not-print-password"
      },
      terminal
    });

    expect(code).toBe(1);
    expect(terminal.output).toContain("DATABASE_ENV_REQUIRED");
    expect(terminal.output).not.toContain("do-not-print-token");
    expect(terminal.output).not.toContain("do-not-print-password");
  });
});

function createFakeRepository(options: {
  failOnChangeIndex?: number;
  mutateBeforeApply?: (sites: CanonicalAssetReconciliationSite[]) => void;
  sites?: CanonicalAssetReconciliationSite[];
  unexpectedApplyError?: Error;
} = {}): CanonicalAssetReconciliationRepository & {
  auditRows: FakeAuditRow[];
  events: string[];
  lastExpectedSiteSlugs: string[];
  lastRequestedSlugs: string[];
  mutationWrites: number;
  site(slug: string): CanonicalAssetReconciliationSite;
  sites: CanonicalAssetReconciliationSite[];
  writeAttempts: number;
} {
  const state = cloneSites(options.sites ?? createCanonicalSites());
  const auditRows: FakeAuditRow[] = [];
  const events: string[] = [];
  const repo = {
    auditRows,
    events,
    lastExpectedSiteSlugs: [] as string[],
    lastRequestedSlugs: [] as string[],
    mutationWrites: 0,
    sites: state,
    writeAttempts: 0,
    async findSitesBySlugs(slugs: readonly string[]) {
      repo.lastRequestedSlugs = [...slugs];
      return state.filter((site) => slugs.includes(site.slug));
    },
    async applyCanonicalAssetChanges(input) {
      repo.writeAttempts += 1;
      if (options.unexpectedApplyError !== undefined) {
        throw options.unexpectedApplyError;
      }

      const beforeSites = cloneSites(state);
      const beforeAudit = [...auditRows];
      try {
        repo.lastExpectedSiteSlugs = input.expectedSites.map((site) => site.slug);
        for (const expected of input.expectedSites) {
          events.push(`lock:${expected.slug}`);
        }
        options.mutateBeforeApply?.(state);
        for (const expected of input.expectedSites) {
          events.push(`recheck:${expected.slug}`);
          const current = state.find((site) => site.slug === expected.slug);
          if (current === undefined || JSON.stringify(normalizeSiteForComparison(current)) !== JSON.stringify(normalizeSiteForComparison(expected))) {
            throw new ReconciliationStateChangedError();
          }
        }
        input.changes.forEach((change, index) => {
          if (options.failOnChangeIndex === index) {
            throw new Error("simulated write failure");
          }
          const target = state.find((site) => site.id === change.siteId);
          if (target === undefined) {
            throw new Error("site missing during write");
          }
          events.push(`update:${change.slug}`);
          target.previewImageUrl = change.after.previewImageUrl;
          target.galleryImages = cloneGallery(change.after.galleryImages);
          repo.mutationWrites += 1;
          auditRows.push({
            action: "site.reconcile_canonical_assets",
            afterJson: change.audit.afterJson,
            beforeJson: change.audit.beforeJson,
            entityId: change.siteId,
            entityType: "site",
            requestId: input.context.requestId
          });
        });
      } catch (error) {
        state.splice(0, state.length, ...beforeSites);
        auditRows.splice(0, auditRows.length, ...beforeAudit);
        repo.mutationWrites = 0;
        throw error;
      }
    },
    site(slug: string) {
      const site = state.find((entry) => entry.slug === slug);
      if (site === undefined) {
        throw new Error(`Missing fake site ${slug}`);
      }
      return site;
    }
  } satisfies CanonicalAssetReconciliationRepository & {
    auditRows: FakeAuditRow[];
    events: string[];
    lastExpectedSiteSlugs: string[];
    lastRequestedSlugs: string[];
    mutationWrites: number;
    site(slug: string): CanonicalAssetReconciliationSite;
    sites: CanonicalAssetReconciliationSite[];
    writeAttempts: number;
  };

  return repo;
}

function normalizeSiteForComparison(site: CanonicalAssetReconciliationSite): CanonicalAssetReconciliationSite {
  return {
    ...site,
    galleryImages: cloneGallery(site.galleryImages)
  };
}

function createCanonicalSites(): CanonicalAssetReconciliationSite[] {
  return CANONICAL_LEGACY_ASSET_TARGET_SLUGS.map((slug) => siteFixture({ slug }));
}

function replaceSite(
  slug: CanonicalLegacyAssetTargetSlug,
  overrides: Partial<CanonicalAssetReconciliationSite>
): CanonicalAssetReconciliationSite[] {
  return createCanonicalSites().map((site) =>
    site.slug === slug
      ? {
          ...site,
          ...overrides,
          galleryImages: overrides.galleryImages ?? site.galleryImages
        }
      : site
  );
}

function siteFixture(
  overrides: Partial<CanonicalAssetReconciliationSite> & { slug: CanonicalLegacyAssetTargetSlug }
): CanonicalAssetReconciliationSite {
  const source = sourceSite(overrides.slug);
  const targetIndex = CANONICAL_LEGACY_ASSET_TARGET_SLUGS.findIndex((target) => target === overrides.slug);
  const { slug, ...rest } = overrides;

  return {
    active: true,
    categoryId: categoryIdFor(source.categorySlug),
    categorySlug: source.categorySlug,
    deletedAt: null,
    galleryImages: galleryFor(slug),
    id: `00000000-0000-4000-8000-${String(targetIndex + 1).padStart(12, "0")}`,
    previewImageUrl: null,
    publishedAt: null,
    slug,
    status: "draft",
    title: source.title,
    ...rest
  };
}

function createProductionLikeLegacyPreviewSites(): CanonicalAssetReconciliationSite[] {
  return createCanonicalSites().map((site) => ({
    ...site,
    previewImageUrl: sourceSite(site.slug).previewImageUrl
  }));
}

function canonicalPreviewFor(slug: CanonicalLegacyAssetTargetSlug): string {
  return `https://prudexxx.github.io/web00-pro/${sourceSite(slug).previewImageUrl}`;
}

function targetFor(
  report: Awaited<ReturnType<typeof reconcileCanonicalLegacyAssets>>,
  slug: CanonicalLegacyAssetTargetSlug
) {
  const target = report.targets.find((item) => item.slug === slug);
  if (target === undefined) {
    throw new Error(`Missing report target ${slug}`);
  }

  return target;
}

function categoryIdFor(categorySlug: string): string {
  const index = [
    "automation",
    "business",
    "commerce",
    "content",
    "services",
    "support",
    "analytics"
  ].findIndex((slug) => slug === categorySlug);

  return `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`;
}

function galleryFor(slug: CanonicalLegacyAssetTargetSlug): CanonicalAssetReconciliationSite["galleryImages"] {
  return sourceSite(slug).galleryImages.map((image, index) => ({
    ...image,
    assetId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`,
    variants: [
      {
        url: `https://storage.example.test/${slug}/${index}/1200.webp`,
        width: 1200
      }
    ]
  }));
}

function sourceSite(slug: string) {
  const site = catalog.sites.find((entry) => entry.slug === slug);
  if (site === undefined) {
    throw new Error(`Missing source site ${slug}`);
  }
  return site;
}

function cloneSites(sites: CanonicalAssetReconciliationSite[]): CanonicalAssetReconciliationSite[] {
  return sites.map((site) => ({
    ...site,
    galleryImages: cloneGallery(site.galleryImages)
  }));
}

function cloneGallery(
  gallery: CanonicalAssetReconciliationSite["galleryImages"]
): CanonicalAssetReconciliationSite["galleryImages"] {
  return gallery.map((image) => ({
    ...image,
    variants: Array.isArray(image.variants)
      ? image.variants.map((variant) => ({ ...variant }))
      : undefined
  }));
}

function snapshotSites(sites: CanonicalAssetReconciliationSite[]) {
  return new Map(cloneSites(sites).map((site) => [site.slug, site]));
}

function createMemoryTerminal() {
  return {
    output: "",
    async close() {},
    async confirmExact() {
      return false;
    },
    async promptSecret() {
      return "";
    },
    async promptVisible() {
      return "";
    },
    writeSafe(message: string) {
      this.output += message;
    }
  };
}
