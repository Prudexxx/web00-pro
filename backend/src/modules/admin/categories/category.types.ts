import type { AdminPaginationMeta } from "../admin.types.js";

export interface AdminCategoryRecord {
  active: boolean;
  createdAt: Date;
  description: string | null;
  id: string;
  siteCount?: number;
  slug: string;
  sortOrder: number;
  title: string;
  updatedAt: Date;
}

export interface AdminCategoryListQuery {
  active?: boolean;
  includeCounts: boolean;
  limit: number;
  page: number;
  search?: string;
}

export interface CreateAdminCategoryInput {
  active?: boolean;
  description?: string | null;
  slug: string;
  sortOrder?: number;
  title: string;
}

export interface UpdateAdminCategoryInput {
  active?: boolean;
  description?: string | null;
  slug?: string;
  sortOrder?: number;
  title?: string;
}

export type AdminCategoryDetail = Record<string, unknown>;

export interface AdminCategoryListResponse {
  data: AdminCategoryDetail[];
  meta: AdminPaginationMeta;
}
