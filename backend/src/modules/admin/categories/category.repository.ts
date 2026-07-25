import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import type { AdminMutationContext } from "../admin.types.js";
import {
  categoryNotFound,
  isUniqueConflict,
  slugConflict
} from "../sites/site.service.js";
import type {
  AdminCategoryListQuery,
  AdminCategoryRecord,
  CreateAdminCategoryInput,
  UpdateAdminCategoryInput
} from "./category.types.js";

export interface AdminCategoryRepository {
  createCategory(
    input: CreateAdminCategoryInput,
    context: AdminMutationContext
  ): Promise<AdminCategoryRecord>;
  deleteCategory(id: string, context: AdminMutationContext): Promise<void>;
  getCategory(id: string): Promise<AdminCategoryRecord | null>;
  listCategories(query: AdminCategoryListQuery, includeInactive: boolean): Promise<{
    rows: AdminCategoryRecord[];
    total: number;
  }>;
  updateCategory(
    id: string,
    input: UpdateAdminCategoryInput,
    context: AdminMutationContext
  ): Promise<AdminCategoryRecord>;
}

const categorySelect = {
  active: true,
  createdAt: true,
  description: true,
  id: true,
  slug: true,
  sortOrder: true,
  title: true,
  updatedAt: true
} satisfies Prisma.CategorySelect;

export function createPrismaAdminCategoryRepository(
  options: { prisma: PrismaClient }
): AdminCategoryRepository {
  const prisma = options.prisma;

  return {
    async createCategory(input, context) {
      try {
        return await prisma.$transaction(async (tx) => {
          const category = await tx.category.create({
            data: {
              active: input.active ?? true,
              description: input.description ?? null,
              slug: input.slug,
              sortOrder: input.sortOrder ?? 0,
              title: input.title
            },
            select: categorySelect
          });

          await createCategoryAudit(tx, {
            action: "category.create",
            afterJson: categorySnapshot(category),
            beforeJson: Prisma.DbNull,
            context,
            entityId: category.id
          });

          return category;
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw slugConflict();
        }

        throw error;
      }
    },
    async deleteCategory(id, context) {
      await prisma.$transaction(async (tx) => {
        const category = await tx.category.findUnique({
          select: categorySelect,
          where: { id }
        });

        if (category === null) {
          throw categoryNotFound();
        }

        const linkedSites = await tx.site.count({
          where: { categoryId: id }
        });

        if (linkedSites > 0) {
          throw new Error("CATEGORY_IN_USE");
        }

        await tx.category.delete({ where: { id } });
        await createCategoryAudit(tx, {
          action: "category.delete",
          afterJson: Prisma.DbNull,
          beforeJson: categorySnapshot(category),
          context,
          entityId: id
        });
      });
    },
    async getCategory(id) {
      return prisma.category.findUnique({
        select: categorySelect,
        where: { id }
      });
    },
    async listCategories(query, includeInactive) {
      const where = createListWhere(query, includeInactive);
      const orderBy = [
        { sortOrder: "asc" },
        { title: "asc" },
        { slug: "asc" }
      ] satisfies Prisma.CategoryOrderByWithRelationInput[];
      const [total, rows] = await prisma.$transaction([
        prisma.category.count({ where }),
        prisma.category.findMany({
          orderBy,
          select: categorySelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where
        })
      ]);

      if (!query.includeCounts) {
        return { rows, total };
      }

      const counts = await prisma.site.groupBy({
        _count: { _all: true },
        by: ["categoryId"],
        where: includeInactive ? {} : { deletedAt: null }
      });
      const countsByCategoryId = new Map(
        counts.map((count) => [count.categoryId, count._count._all])
      );

      return {
        rows: rows.map((row) => ({
          ...row,
          siteCount: countsByCategoryId.get(row.id) ?? 0
        })),
        total
      };
    },
    async updateCategory(id, input, context) {
      try {
        return await prisma.$transaction(async (tx) => {
          const before = await tx.category.findUnique({
            select: categorySelect,
            where: { id }
          });

          if (before === null) {
            throw categoryNotFound();
          }

          const after = await tx.category.update({
            data: input,
            select: categorySelect,
            where: { id }
          });

          await createCategoryAudit(tx, {
            action: "category.update",
            afterJson: changedCategoryFields(before, after),
            beforeJson: changedCategoryFields(after, before),
            context,
            entityId: id
          });

          return after;
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw slugConflict();
        }

        throw error;
      }
    }
  };
}

function createListWhere(
  query: AdminCategoryListQuery,
  includeInactive: boolean
): Prisma.CategoryWhereInput {
  return {
    ...(includeInactive
      ? query.active === undefined
        ? {}
        : { active: query.active }
      : { active: true }),
    ...(query.search === undefined
      ? {}
      : {
          OR: [
            { slug: { contains: query.search, mode: "insensitive" } },
            { title: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } }
          ]
        })
  };
}

async function createCategoryAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    afterJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    beforeJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    context: AdminMutationContext;
    entityId: string;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.context.actor.id,
      afterJson: input.afterJson,
      beforeJson: input.beforeJson,
      entityId: input.entityId,
      entityType: "category",
      ipHash: null,
      requestId: input.context.requestId,
      userAgentHash: null
    }
  });
}

function categorySnapshot(category: AdminCategoryRecord): Prisma.InputJsonValue {
  return {
    active: category.active,
    id: category.id,
    slug: category.slug,
    sortOrder: category.sortOrder,
    title: category.title
  };
}

function changedCategoryFields(
  from: AdminCategoryRecord,
  to: AdminCategoryRecord
): Prisma.InputJsonValue {
  const changed: Record<string, unknown> = {};

  for (const key of ["active", "description", "slug", "sortOrder", "title"] as const) {
    if (from[key] !== to[key]) {
      changed[key] = to[key];
    }
  }

  return changed as Prisma.InputJsonValue;
}
