import { resolveCatalogAssetUrl } from "../../../lib/catalog-asset-url.js";

export const CANONICAL_LEGACY_ASSET_TARGET_SLUGS = [
  "mebel",
  "massage",
  "drova"
] as const;

export const CANONICAL_LEGACY_ASSET_LOCK_ORDER = [
  "drova",
  "massage",
  "mebel"
] as const satisfies readonly CanonicalLegacyAssetTargetSlug[];

export const CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION =
  "WEB00-CANONICAL-ASSETS-15-7";

export const RECONCILIATION_STATE_CHANGED_MESSAGE =
  "Данные карточек изменились. Повторите проверку состояния.";

export type CanonicalLegacyAssetTargetSlug =
  (typeof CANONICAL_LEGACY_ASSET_TARGET_SLUGS)[number];

export interface CanonicalAssetSourceCatalog {
  sites: CanonicalAssetSourceSite[];
}

export interface CanonicalAssetSourceSite {
  categorySlug: string;
  galleryImages: CanonicalAssetSourceGalleryImage[];
  previewImageUrl: string;
  slug: string;
  title: string;
}

export interface CanonicalAssetSourceGalleryImage {
  alt: string;
  sortOrder: number;
  storagePath: string;
  url: string;
}

export interface CanonicalAssetGalleryImage {
  alt: string;
  assetId?: string;
  sortOrder: number;
  storagePath: string;
  url: string;
  variants?: unknown;
  [key: string]: unknown;
}

export interface CanonicalAssetReconciliationSite {
  active: boolean;
  categoryId: string;
  categorySlug: string;
  deletedAt: Date | string | null;
  galleryImages: CanonicalAssetGalleryImage[];
  id: string;
  previewImageUrl: string | null;
  publishedAt: Date | string | null;
  slug: string;
  status: string;
  title: string;
}

export interface CanonicalAssetReconciliationContext {
  actorUserId: string | null;
  ipHash: string | null;
  requestId: string;
  userAgentHash: string | null;
}

export interface CanonicalAssetReconciliationRepository {
  applyCanonicalAssetChanges(input: {
    changes: CanonicalAssetReconciliationChange[];
    context: CanonicalAssetReconciliationContext;
    expectedSites: CanonicalAssetReconciliationSite[];
  }): Promise<void>;
  findSitesBySlugs(
    slugs: readonly CanonicalLegacyAssetTargetSlug[]
  ): Promise<CanonicalAssetReconciliationSite[]>;
}

export interface CanonicalAssetReconciliationOptions {
  apply?: boolean;
  catalog: CanonicalAssetSourceCatalog;
  confirm?: string;
  context: CanonicalAssetReconciliationContext;
  repository: CanonicalAssetReconciliationRepository;
}

export interface CanonicalAssetReconciliationChange {
  after: CanonicalAssetReconciliationSnapshot;
  audit: {
    afterJson: CanonicalAssetReconciliationAuditSnapshot;
    beforeJson: CanonicalAssetReconciliationAuditSnapshot;
  };
  before: CanonicalAssetReconciliationSnapshot;
  siteId: string;
  slug: CanonicalLegacyAssetTargetSlug;
}

export interface CanonicalAssetReconciliationSnapshot {
  galleryImages: CanonicalAssetGalleryImage[];
  previewImageUrl: string | null;
}

export interface CanonicalAssetReconciliationAuditSnapshot {
  gallery: {
    assetId?: string;
    sortOrder: number;
    storagePath: string;
    url: string;
  }[];
  galleryCount: number;
  previewImageUrl: string | null;
  slug: CanonicalLegacyAssetTargetSlug;
}

export interface CanonicalAssetReconciliationReport {
  blockers: string[];
  message?: string;
  mode: "apply" | "dry-run";
  status: "already-reconciled" | "applied" | "blocked" | "ready";
  targets: CanonicalAssetReconciliationTargetReport[];
  totals: {
    appliedSiteUpdates: number;
    plannedGalleryUrlUpdates: number;
    plannedPreviewUpdates: number;
    targetSites: number;
  };
}

export interface CanonicalAssetReconciliationTargetReport {
  active: boolean | null;
  blockers: string[];
  categoryMatch: boolean | null;
  deleted: boolean | null;
  found: boolean;
  galleryCount: number | null;
  gallerySourceMatch: boolean | null;
  plannedGalleryUrlUpdates: number;
  plannedPreviewUpdate: boolean;
  previewState: "already-canonical" | "blocked" | "missing" | "unknown";
  slug: CanonicalLegacyAssetTargetSlug;
  status: string | null;
  titleMatch: boolean | null;
}

interface SitePlan {
  change: CanonicalAssetReconciliationChange | null;
  report: CanonicalAssetReconciliationTargetReport;
}

export class ReconciliationStateChangedError extends Error {
  public constructor() {
    super(RECONCILIATION_STATE_CHANGED_MESSAGE);
    this.name = "ReconciliationStateChangedError";
  }
}

export async function reconcileCanonicalLegacyAssets(
  options: CanonicalAssetReconciliationOptions
): Promise<CanonicalAssetReconciliationReport> {
  const mode = options.apply === true ? "apply" : "dry-run";

  if (
    options.apply === true &&
    options.confirm !== CANONICAL_LEGACY_ASSET_APPLY_CONFIRMATION
  ) {
    return emptyBlockedReport(mode, "APPLY_CONFIRMATION_REQUIRED");
  }

  const sourceSites = collectSourceSites(options.catalog);
  const rows = await options.repository.findSitesBySlugs(
    CANONICAL_LEGACY_ASSET_TARGET_SLUGS
  );
  const foundBySlug = new Map<string, CanonicalAssetReconciliationSite>();
  const blockers: string[] = [];

  for (const row of rows) {
    if (!isTargetSlug(row.slug)) {
      continue;
    }
    if (foundBySlug.has(row.slug)) {
      blockers.push(`SITE_DUPLICATE:${row.slug}`);
      continue;
    }
    foundBySlug.set(row.slug, row);
  }

  const plans = CANONICAL_LEGACY_ASSET_TARGET_SLUGS.map((slug) =>
    planTargetSite(slug, sourceSites.get(slug) ?? null, foundBySlug.get(slug) ?? null)
  );

  for (const plan of plans) {
    blockers.push(...plan.report.blockers);
  }

  const totals = summarizePlans(plans, 0);
  if (blockers.length > 0) {
    return {
      blockers,
      mode,
      status: "blocked",
      targets: plans.map((plan) => plan.report),
      totals
    };
  }

  if (mode === "dry-run") {
    return {
      blockers: [],
      mode,
      status: "ready",
      targets: plans.map((plan) => plan.report),
      totals
    };
  }

  const changes = plans.flatMap((plan) =>
    plan.change === null ? [] : [plan.change]
  );

  if (changes.length === 0) {
    return {
      blockers: [],
      mode,
      status: "already-reconciled",
      targets: plans.map((plan) => plan.report),
      totals
    };
  }

  try {
    await options.repository.applyCanonicalAssetChanges({
      changes,
      context: options.context,
      expectedSites: selectExpectedSitesForApply(foundBySlug)
    });
  } catch (error) {
    if (error instanceof ReconciliationStateChangedError) {
      return {
        blockers: ["RECONCILIATION_STATE_CHANGED"],
        message: RECONCILIATION_STATE_CHANGED_MESSAGE,
        mode,
        status: "blocked",
        targets: plans.map((plan) => plan.report),
        totals
      };
    }

    throw error;
  }

  return {
    blockers: [],
    mode,
    status: "applied",
    targets: plans.map((plan) => plan.report),
    totals: summarizePlans(plans, changes.length)
  };
}

export function formatCanonicalAssetReconciliationReport(
  report: CanonicalAssetReconciliationReport
): string {
  return JSON.stringify(
    {
      code: `canonical_asset_reconciliation_${report.status}`,
      report
    },
    null,
    2
  );
}

function emptyBlockedReport(
  mode: CanonicalAssetReconciliationReport["mode"],
  blocker: string
): CanonicalAssetReconciliationReport {
  return {
    blockers: [blocker],
    mode,
    status: "blocked",
    targets: [],
    totals: {
      appliedSiteUpdates: 0,
      plannedGalleryUrlUpdates: 0,
      plannedPreviewUpdates: 0,
      targetSites: CANONICAL_LEGACY_ASSET_TARGET_SLUGS.length
    }
  };
}

function collectSourceSites(
  catalog: CanonicalAssetSourceCatalog
): Map<CanonicalLegacyAssetTargetSlug, CanonicalAssetSourceSite> {
  const bySlug = new Map<CanonicalLegacyAssetTargetSlug, CanonicalAssetSourceSite>();

  for (const site of catalog.sites) {
    if (isTargetSlug(site.slug)) {
      bySlug.set(site.slug, site);
    }
  }

  return bySlug;
}

function planTargetSite(
  slug: CanonicalLegacyAssetTargetSlug,
  source: CanonicalAssetSourceSite | null,
  site: CanonicalAssetReconciliationSite | null
): SitePlan {
  if (source === null) {
    return missingTargetReport(slug, `SOURCE_SITE_MISSING:${slug}`);
  }
  if (site === null) {
    return missingTargetReport(slug, `SITE_MISSING:${slug}`);
  }

  const blockers: string[] = [];
  const expectedPreviewUrl = resolveSourceAssetUrl(source.previewImageUrl);
  if (expectedPreviewUrl === null) {
    blockers.push(`SOURCE_PREVIEW_INVALID:${slug}`);
  }

  if (site.slug !== slug) {
    blockers.push(`SLUG_MISMATCH:${slug}`);
  }
  if (site.deletedAt !== null) {
    blockers.push(`SITE_DELETED:${slug}`);
  }
  if (site.status !== "draft") {
    blockers.push(`SITE_NOT_DRAFT:${slug}`);
  }
  if (site.active !== true) {
    blockers.push(`SITE_INACTIVE:${slug}`);
  }
  if (site.categorySlug !== source.categorySlug) {
    blockers.push(`CATEGORY_MISMATCH:${slug}`);
  }
  if (site.title !== source.title) {
    blockers.push(`TITLE_MISMATCH:${slug}`);
  }
  if (site.galleryImages.length !== source.galleryImages.length) {
    blockers.push(`GALLERY_COUNT_MISMATCH:${slug}`);
  }

  const previewState = planPreviewState(site.previewImageUrl, expectedPreviewUrl, slug);
  if (previewState.blocker !== null) {
    blockers.push(previewState.blocker);
  }

  const galleryPlan = planGallery(site, source, slug);
  blockers.push(...galleryPlan.blockers);

  const report: CanonicalAssetReconciliationTargetReport = {
    active: site.active,
    blockers,
    categoryMatch: site.categorySlug === source.categorySlug,
    deleted: site.deletedAt !== null,
    found: true,
    galleryCount: site.galleryImages.length,
    gallerySourceMatch: galleryPlan.blockers.length === 0,
    plannedGalleryUrlUpdates: galleryPlan.updateCount,
    plannedPreviewUpdate: previewState.needsUpdate,
    previewState: previewState.state,
    slug,
    status: site.status,
    titleMatch: site.title === source.title
  };

  if (blockers.length > 0 || expectedPreviewUrl === null) {
    return {
      change: null,
      report
    };
  }

  const nextPreviewImageUrl = previewState.needsUpdate
    ? expectedPreviewUrl
    : site.previewImageUrl;
  const hasChanges = previewState.needsUpdate || galleryPlan.updateCount > 0;

  return {
    change: hasChanges
      ? {
          after: {
            galleryImages: galleryPlan.nextGalleryImages,
            previewImageUrl: nextPreviewImageUrl
          },
          audit: {
            afterJson: auditSnapshot(slug, nextPreviewImageUrl, galleryPlan.nextGalleryImages),
            beforeJson: auditSnapshot(slug, site.previewImageUrl, site.galleryImages)
          },
          before: {
            galleryImages: cloneGallery(site.galleryImages),
            previewImageUrl: site.previewImageUrl
          },
          siteId: site.id,
          slug
        }
      : null,
    report
  };
}

function missingTargetReport(
  slug: CanonicalLegacyAssetTargetSlug,
  blocker: string
): SitePlan {
  return {
    change: null,
    report: {
      active: null,
      blockers: [blocker],
      categoryMatch: null,
      deleted: null,
      found: false,
      galleryCount: null,
      gallerySourceMatch: null,
      plannedGalleryUrlUpdates: 0,
      plannedPreviewUpdate: false,
      previewState: "unknown",
      slug,
      status: null,
      titleMatch: null
    }
  };
}

function planPreviewState(
  current: string | null,
  expectedPreviewUrl: string | null,
  slug: CanonicalLegacyAssetTargetSlug
): {
  blocker: string | null;
  needsUpdate: boolean;
  state: CanonicalAssetReconciliationTargetReport["previewState"];
} {
  if (expectedPreviewUrl === null) {
    return {
      blocker: null,
      needsUpdate: false,
      state: "unknown"
    };
  }
  if (current === null) {
    return {
      blocker: null,
      needsUpdate: true,
      state: "missing"
    };
  }
  if (current === expectedPreviewUrl) {
    return {
      blocker: null,
      needsUpdate: false,
      state: "already-canonical"
    };
  }

  return {
    blocker: `PREVIEW_URL_CONFLICT:${slug}`,
    needsUpdate: false,
    state: "blocked"
  };
}

function planGallery(
  site: CanonicalAssetReconciliationSite,
  source: CanonicalAssetSourceSite,
  slug: CanonicalLegacyAssetTargetSlug
): {
  blockers: string[];
  nextGalleryImages: CanonicalAssetGalleryImage[];
  updateCount: number;
} {
  const blockers: string[] = [];
  const nextGalleryImages = cloneGallery(site.galleryImages);
  let updateCount = 0;

  for (let index = 0; index < site.galleryImages.length; index += 1) {
    const currentImage = site.galleryImages[index];
    const sourceImage = source.galleryImages[index];
    if (currentImage === undefined || sourceImage === undefined) {
      continue;
    }
    const expectedUrl = resolveSourceAssetUrl(sourceImage.url);

    if (currentImage.sortOrder !== sourceImage.sortOrder) {
      blockers.push(`GALLERY_ORDER_MISMATCH:${slug}:${index}`);
    }
    if (expectedUrl === null) {
      blockers.push(`SOURCE_GALLERY_URL_INVALID:${slug}:${index}`);
      continue;
    }

    const resolvedCurrent = resolveCatalogAssetUrl(currentImage.url);
    if (resolvedCurrent === null || resolvedCurrent.url !== expectedUrl) {
      blockers.push(`GALLERY_URL_MISMATCH:${slug}:${index}`);
      continue;
    }

    if (currentImage.url !== expectedUrl) {
      const nextImage = nextGalleryImages[index];
      if (nextImage !== undefined) {
        nextImage.url = expectedUrl;
        updateCount += 1;
      }
    }
  }

  return {
    blockers,
    nextGalleryImages,
    updateCount
  };
}

function resolveSourceAssetUrl(path: string): string | null {
  const resolved = resolveCatalogAssetUrl(path);

  return resolved?.source === "legacy" ? resolved.url : null;
}

function auditSnapshot(
  slug: CanonicalLegacyAssetTargetSlug,
  previewImageUrl: string | null,
  galleryImages: CanonicalAssetGalleryImage[]
): CanonicalAssetReconciliationAuditSnapshot {
  return {
    gallery: galleryImages.map((image) => {
      const item = {
        sortOrder: image.sortOrder,
        storagePath: image.storagePath,
        url: image.url
      } satisfies {
        assetId?: string;
        sortOrder: number;
        storagePath: string;
        url: string;
      };

      if (typeof image.assetId === "string") {
        return {
          ...item,
          assetId: image.assetId
        };
      }

      return item;
    }),
    galleryCount: galleryImages.length,
    previewImageUrl,
    slug
  };
}

function summarizePlans(
  plans: SitePlan[],
  appliedSiteUpdates: number
): CanonicalAssetReconciliationReport["totals"] {
  return {
    appliedSiteUpdates,
    plannedGalleryUrlUpdates: plans.reduce(
      (total, plan) => total + plan.report.plannedGalleryUrlUpdates,
      0
    ),
    plannedPreviewUpdates: plans.reduce(
      (total, plan) => total + (plan.report.plannedPreviewUpdate ? 1 : 0),
      0
    ),
    targetSites: CANONICAL_LEGACY_ASSET_TARGET_SLUGS.length
  };
}

function cloneGallery(
  galleryImages: CanonicalAssetGalleryImage[]
): CanonicalAssetGalleryImage[] {
  return galleryImages.map((image) => ({ ...image }));
}

function cloneSite(site: CanonicalAssetReconciliationSite): CanonicalAssetReconciliationSite {
  return {
    ...site,
    galleryImages: cloneGallery(site.galleryImages)
  };
}

function selectExpectedSitesForApply(
  foundBySlug: Map<string, CanonicalAssetReconciliationSite>
): CanonicalAssetReconciliationSite[] {
  return CANONICAL_LEGACY_ASSET_LOCK_ORDER.map((slug) => cloneSite(foundBySlug.get(slug)!));
}

function isTargetSlug(value: string): value is CanonicalLegacyAssetTargetSlug {
  return CANONICAL_LEGACY_ASSET_TARGET_SLUGS.some((slug) => slug === value);
}
