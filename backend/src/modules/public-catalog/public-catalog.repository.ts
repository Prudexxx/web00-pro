import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  CategoryDetailQuery,
  CategoryListQuery,
  PaginatedPublicSiteRecords,
  PopularSitesQuery,
  PublicCatalogRepository,
  PublicCategoryRecord,
  PublicCategoryWithSitesRecord,
  PublicSiteRecord,
  SiteListQuery
} from "./public-catalog.types.js";
import {
  publicCategoryVisibilityWhere,
  publicSiteVisibilityWhere
} from "./public-catalog.visibility.js";
import { siteOrderBy } from "./public-catalog.sort.js";

export const publicSiteSelect = {
  category: {
    select: {
      slug: true,
      title: true
    }
  },
  deliveryLabel: true,
  demoMode: true,
  demoUrl: true,
  developmentDays: true,
  featured: true,
  features: true,
  fullDescription: true,
  galleryImages: true,
  id: true,
  previewImageUrl: true,
  previewType: true,
  priceAmountCents: true,
  priceLabel: true,
  publishedAt: true,
  shortDescription: true,
  siteUrl: true,
  slug: true,
  tags: true,
  title: true
} satisfies Prisma.SiteSelect;

const publicCategorySelect = {
  description: true,
  slug: true,
  sortOrder: true,
  title: true
} satisfies Prisma.CategorySelect;

const publicCategoryWithIdSelect = {
  ...publicCategorySelect,
  id: true
} satisfies Prisma.CategorySelect;

const categoryOrderBy = [
  { sortOrder: "asc" },
  { title: "asc" },
  { slug: "asc" }
] satisfies Prisma.CategoryOrderByWithRelationInput[];

export function createPrismaPublicCatalogRepository(
  options: { prisma: PrismaClient }
): PublicCatalogRepository {
  const prisma = options.prisma;

  return {
    async getPublicCategoryBySlug(slug) {
      const row = await prisma.category.findFirst({
        select: publicCategorySelect,
        where: {
          ...publicCategoryVisibilityWhere(),
          slug
        }
      });

      return row;
    },

    async getPublicCategoryWithSites(slug, query) {
      const category = await prisma.category.findFirst({
        select: publicCategoryWithIdSelect,
        where: {
          ...publicCategoryVisibilityWhere(),
          slug
        }
      });

      if (category === null) {
        return null;
      }

      const categoryRecord: PublicCategoryRecord = {
        description: category.description,
        slug: category.slug,
        sortOrder: category.sortOrder,
        title: category.title
      };

      if (!query.includeSites) {
        return { category: categoryRecord };
      }

      const siteWhere: Prisma.SiteWhereInput = {
        ...publicSiteVisibilityWhere(),
        categoryId: category.id
      };
      const [total, sites] = await prisma.$transaction([
        prisma.site.count({ where: siteWhere }),
        prisma.site.findMany({
          orderBy: siteOrderBy(query.sort),
          select: publicSiteSelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where: siteWhere
        })
      ]);

      return {
        category: {
          ...categoryRecord,
          siteCount: total
        },
        meta: createPaginationMeta(query, total),
        sites: sites as PublicSiteRecord[]
      };
    },

    async getPublicSiteBySlug(slug) {
      const row = await prisma.site.findFirst({
        select: publicSiteSelect,
        where: {
          ...publicSiteVisibilityWhere(),
          category: publicCategoryVisibilityWhere(),
          slug
        }
      });

      return row as PublicSiteRecord | null;
    },

    async listCategories(query) {
      const categories = await prisma.category.findMany({
        orderBy: categoryOrderBy,
        select: publicCategoryWithIdSelect,
        where: publicCategoryVisibilityWhere()
      });

      if (!query.includeCounts) {
        return categories.map(({ id: _id, ...category }) => category);
      }

      const counts = await prisma.site.groupBy({
        _count: { _all: true },
        by: ["categoryId"],
        where: {
          ...publicSiteVisibilityWhere(),
          category: publicCategoryVisibilityWhere()
        }
      });
      const countsByCategoryId = new Map(
        counts.map((count) => [count.categoryId, count._count._all])
      );

      return categories.map(({ id, ...category }) => ({
        ...category,
        siteCount: countsByCategoryId.get(id) ?? 0
      }));
    },

    async listPopularSites(query) {
      const where = createPopularSiteWhere(query);
      const rows = await prisma.site.findMany({
        orderBy: siteOrderBy("popular"),
        select: publicSiteSelect,
        take: query.limit,
        where
      });

      return rows as PublicSiteRecord[];
    },

    async listSites(query) {
      const where = createSiteListWhere(query);
      const [total, rows] = await prisma.$transaction([
        prisma.site.count({ where }),
        prisma.site.findMany({
          orderBy: siteOrderBy(query.sort),
          select: publicSiteSelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where
        })
      ]);

      return {
        meta: createPaginationMeta(query, total),
        rows: rows as PublicSiteRecord[]
      };
    }
  };
}

function createSiteListWhere(query: SiteListQuery): Prisma.SiteWhereInput {
  return {
    ...publicSiteVisibilityWhere(),
    category:
      query.category === undefined
        ? publicCategoryVisibilityWhere()
        : {
            ...publicCategoryVisibilityWhere(),
            slug: query.category
          },
    ...(query.search !== undefined
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { shortDescription: { contains: query.search, mode: "insensitive" } }
          ]
        }
      : {}),
    ...(query.tags.length > 0 ? { tags: { hasEvery: query.tags } } : {})
  };
}

function createPopularSiteWhere(query: PopularSitesQuery): Prisma.SiteWhereInput {
  return {
    ...publicSiteVisibilityWhere(),
    category:
      query.category === undefined
        ? publicCategoryVisibilityWhere()
        : {
            ...publicCategoryVisibilityWhere(),
            slug: query.category
          }
  };
}

function createPaginationMeta(
  query: Pick<CategoryDetailQuery | SiteListQuery, "limit" | "page">,
  total: number
): PaginatedPublicSiteRecords["meta"] {
  return {
    limit: query.limit,
    page: query.page,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
  };
}
