import type {
  AdminSiteDetail,
  AdminSiteRecord,
  AdminSiteViewRole
} from "./site.types.js";

export function mapAdminSiteDetail(
  record: AdminSiteRecord,
  role: AdminSiteViewRole
): AdminSiteDetail {
  const common = {
    category: {
      id: record.category.id,
      slug: record.category.slug,
      title: record.category.title
    },
    categoryId: record.categoryId,
    createdAt: record.createdAt.toISOString(),
    deliveryLabel: record.deliveryLabel,
    demoLocalUrl: record.demoLocalUrl,
    demoMode: record.demoMode,
    demoUrl: record.demoUrl,
    developmentDays: record.developmentDays,
    externalDemoUrl: record.externalDemoUrl,
    featured: record.featured,
    features: record.features,
    fullDescription: record.fullDescription,
    galleryImages: record.galleryImages,
    id: record.id,
    legacyTitle: record.legacyTitle,
    originalDemoUrl: record.originalDemoUrl,
    previewImageUrl: record.previewImageUrl,
    previewType: record.previewType,
    priceAmountCents: record.priceAmountCents,
    priceLabel: record.priceLabel,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    shortDescription: record.shortDescription,
    siteUrl: record.siteUrl,
    slug: record.slug,
    sortOrder: record.sortOrder,
    status: record.status,
    tags: record.tags,
    title: record.title,
    updatedAt: record.updatedAt.toISOString()
  };

  if (role === "admin") {
    return {
      ...common,
      active: record.active,
      deletedAt: record.deletedAt?.toISOString() ?? null,
      views: record.views
    };
  }

  return common;
}

export function mapAdminSiteList(
  records: readonly AdminSiteRecord[],
  role: AdminSiteViewRole
): AdminSiteDetail[] {
  return records.map((record) => mapAdminSiteDetail(record, role));
}
