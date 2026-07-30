import type { AdminPaginationMeta } from "../admin.types.js";

export type AdminSiteSort = "createdAt" | "sortOrder" | "title" | "updatedAt";
export type AdminSortDirection = "asc" | "desc";
export type AdminDeletedFilter = "with" | "without" | "only";
export type AdminSiteStatus = "archived" | "draft" | "published";
export type AdminSiteViewRole = "admin" | "editor";

export interface AdminSiteCategoryRecord {
  id: string;
  slug: string;
  title: string;
}

export interface AdminSiteRecord {
  active: boolean;
  category: AdminSiteCategoryRecord;
  categoryId: string;
  createdAt: Date;
  deletedAt: Date | null;
  deliveryLabel: string | null;
  demoLocalUrl: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  externalDemoUrl: string | null;
  featured: boolean;
  features: string[];
  fullDescription: string | null;
  galleryImages: unknown;
  id: string;
  legacyTitle: string | null;
  originalDemoUrl: string | null;
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  publishedAt: Date | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  sortOrder: number;
  status: string;
  tags: string[];
  title: string;
  updatedAt: Date;
  views: number;
}

export interface AdminSiteListQuery {
  active?: boolean;
  category?: string;
  deleted: AdminDeletedFilter;
  direction: AdminSortDirection;
  featured?: boolean;
  limit: number;
  page: number;
  search?: string;
  sort: AdminSiteSort;
  status?: AdminSiteStatus;
}

export interface CreateAdminSiteInput {
  categoryId: string;
  deliveryLabel?: string | null;
  demoLocalUrl?: string | null;
  demoMode?: string | null;
  demoUrl?: string | null;
  developmentDays?: number | null;
  externalDemoUrl?: string | null;
  features?: string[];
  fullDescription?: string | null;
  legacyTitle?: string | null;
  originalDemoUrl?: string | null;
  previewType?: string | null;
  priceAmountCents?: number | null;
  priceLabel?: string | null;
  shortDescription: string;
  siteUrl?: string | null;
  slug: string;
  sortOrder?: number;
  tags?: string[];
  title: string;
}

export interface UpdateAdminSiteInput {
  categoryId?: string;
  deliveryLabel?: string | null;
  demoLocalUrl?: string | null;
  demoMode?: string | null;
  demoUrl?: string | null;
  developmentDays?: number | null;
  externalDemoUrl?: string | null;
  featured?: boolean;
  features?: string[];
  fullDescription?: string | null;
  legacyTitle?: string | null;
  originalDemoUrl?: string | null;
  previewType?: string | null;
  priceAmountCents?: number | null;
  priceLabel?: string | null;
  shortDescription?: string;
  siteUrl?: string | null;
  slug?: string;
  sortOrder?: number;
  tags?: string[];
  title?: string;
}

export interface SiteLifecycleRecord {
  deletedAt: Date | null;
  galleryImages?: unknown;
  previewImageUrl?: string | null;
  status: string;
}

export type AdminSiteDetail = Record<string, unknown>;

export interface AdminSiteListResponse {
  data: AdminSiteDetail[];
  meta: AdminPaginationMeta;
}
