export type SiteSort = "sortOrder" | "newest" | "popular" | "title";

export interface PaginationQuery {
  limit: number;
  page: number;
}

export interface SiteListQuery extends PaginationQuery {
  category?: string;
  search?: string;
  sort: SiteSort;
  tags: string[];
}

export interface PopularSitesQuery {
  category?: string;
  limit: number;
}

export interface CategoryListQuery {
  includeCounts: boolean;
}

export interface CategoryDetailQuery extends PaginationQuery {
  includeSites: boolean;
  sort: SiteSort;
}

export interface PaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface PublicGalleryImage {
  alt: string;
  sortOrder: number;
  storagePath: string;
  url: string;
}

export interface PublicSiteCategory {
  slug: string;
  title: string;
}

export interface PublicSiteSummary {
  category: PublicSiteCategory;
  deliveryLabel: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  featured: boolean;
  features: string[];
  galleryImages: PublicGalleryImage[];
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  tags: string[];
  title: string;
}

export interface PublicSiteDetail extends PublicSiteSummary {
  fullDescription: string | null;
  publishedAt: string | null;
}

export interface PublicCategorySummary {
  description: string | null;
  siteCount?: number;
  slug: string;
  sortOrder: number;
  title: string;
}

export interface PublicCategoryDetail extends PublicCategorySummary {
  sites?: PublicSiteSummary[];
}

export interface PublicSiteRecord {
  category: PublicSiteCategory;
  deliveryLabel: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  featured: boolean;
  features: string[];
  fullDescription: string | null;
  galleryImages: unknown;
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  publishedAt: Date | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  tags: string[];
  title: string;
}

export interface PublicCategoryRecord {
  description: string | null;
  siteCount?: number;
  slug: string;
  sortOrder: number;
  title: string;
}

export interface PaginatedPublicSiteRecords {
  meta: PaginationMeta;
  rows: PublicSiteRecord[];
}

export interface PublicCategoryWithSitesRecord {
  category: PublicCategoryRecord;
  meta?: PaginationMeta;
  sites?: PublicSiteRecord[];
}

export interface SiteListResponse {
  data: PublicSiteSummary[];
  meta: PaginationMeta;
}

export interface PopularSitesResponse {
  data: PublicSiteSummary[];
}

export interface SiteDetailResponse {
  data: PublicSiteDetail;
}

export interface CategoryListResponse {
  data: PublicCategorySummary[];
}

export interface CategoryDetailResponse {
  data: PublicCategoryDetail;
  meta?: PaginationMeta;
}

export interface PublicCatalogRepository {
  getPublicCategoryBySlug(slug: string): Promise<PublicCategoryRecord | null>;
  getPublicCategoryWithSites(
    slug: string,
    query: CategoryDetailQuery
  ): Promise<PublicCategoryWithSitesRecord | null>;
  getPublicSiteBySlug(slug: string): Promise<PublicSiteRecord | null>;
  listCategories(query: CategoryListQuery): Promise<PublicCategoryRecord[]>;
  listPopularSites(query: PopularSitesQuery): Promise<PublicSiteRecord[]>;
  listSites(query: SiteListQuery): Promise<PaginatedPublicSiteRecords>;
}
