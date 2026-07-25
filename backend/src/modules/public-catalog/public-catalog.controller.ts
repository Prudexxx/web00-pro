import type { RequestHandler } from "express";
import {
  parseCategoryDetailQuery,
  parseCategoryListQuery,
  parsePopularSitesQuery,
  parseSiteListQuery,
  parseSlugParam
} from "./public-catalog.schemas.js";
import type { PublicCatalogService } from "./public-catalog.service.js";

export interface PublicCatalogController {
  getCategoryBySlug: RequestHandler;
  getSiteBySlug: RequestHandler;
  listCategories: RequestHandler;
  listPopularSites: RequestHandler;
  listSites: RequestHandler;
}

export function createPublicCatalogController(
  options: { service: PublicCatalogService }
): PublicCatalogController {
  const service = options.service;

  return {
    async getCategoryBySlug(request, response) {
      const slug = parseSlugParam(request.params, "slug");
      const query = parseCategoryDetailQuery(request.query);

      response.json(await service.getCategoryBySlug(slug, query));
    },

    async getSiteBySlug(request, response) {
      const slug = parseSlugParam(request.params, "slug");

      response.json(await service.getSiteBySlug(slug));
    },

    async listCategories(request, response) {
      const query = parseCategoryListQuery(request.query);

      response.json(await service.listCategories(query));
    },

    async listPopularSites(request, response) {
      const query = parsePopularSitesQuery(request.query);

      response.json(await service.listPopularSites(query));
    },

    async listSites(request, response) {
      const query = parseSiteListQuery(request.query);

      response.json(await service.listSites(query));
    }
  };
}
