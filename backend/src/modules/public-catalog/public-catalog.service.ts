import { AppError } from "../../lib/errors.js";
import {
  mapCategory,
  mapCategoryDetail,
  mapSiteDetail,
  mapSiteSummary
} from "./public-catalog.mapper.js";
import type { ManagedImageUrlPolicy } from "../images/image.types.js";
import type {
  CategoryDetailQuery,
  CategoryDetailResponse,
  CategoryListQuery,
  CategoryListResponse,
  PopularSitesQuery,
  PopularSitesResponse,
  PublicCatalogRepository,
  SiteDetailResponse,
  SiteListQuery,
  SiteListResponse
} from "./public-catalog.types.js";

export interface PublicCatalogService {
  getCategoryBySlug(slug: string, query: CategoryDetailQuery): Promise<CategoryDetailResponse>;
  getSiteBySlug(slug: string): Promise<SiteDetailResponse>;
  listCategories(query: CategoryListQuery): Promise<CategoryListResponse>;
  listPopularSites(query: PopularSitesQuery): Promise<PopularSitesResponse>;
  listSites(query: SiteListQuery): Promise<SiteListResponse>;
}

export function createPublicCatalogService(
  options: { imageUrlPolicy?: ManagedImageUrlPolicy; repository: PublicCatalogRepository }
): PublicCatalogService {
  const repository = options.repository;

  return {
    async getCategoryBySlug(slug, query) {
      if (!query.includeSites) {
        const category = await repository.getPublicCategoryBySlug(slug);

        if (category === null) {
          throw categoryNotFoundError();
        }

        return { data: mapCategoryDetail(category) };
      }

      const result = await repository.getPublicCategoryWithSites(slug, query);

      if (result === null) {
        throw categoryNotFoundError();
      }

      const sites = (result.sites ?? []).map((site) =>
        mapSiteSummary(site, options.imageUrlPolicy)
      );
      const data = mapCategoryDetail(result.category, sites);

      return result.meta === undefined ? { data } : { data, meta: result.meta };
    },

    async getSiteBySlug(slug) {
      const site = await repository.getPublicSiteBySlug(slug);

      if (site === null) {
        throw new AppError({
          code: "SITE_NOT_FOUND",
          message: "Site not found.",
          statusCode: 404
        });
      }

      return { data: mapSiteDetail(site, options.imageUrlPolicy) };
    },

    async listCategories(query) {
      const categories = await repository.listCategories(query);

      return {
        data: categories.map((category) => mapCategory(category))
      };
    },

    async listPopularSites(query) {
      const sites = await repository.listPopularSites(query);

      return {
        data: sites.map((site) => mapSiteSummary(site, options.imageUrlPolicy))
      };
    },

    async listSites(query) {
      const result = await repository.listSites(query);

      return {
        data: result.rows.map((site) => mapSiteSummary(site, options.imageUrlPolicy)),
        meta: result.meta
      };
    }
  };
}

function categoryNotFoundError(): AppError {
  return new AppError({
    code: "CATEGORY_NOT_FOUND",
    message: "Category not found.",
    statusCode: 404
  });
}
