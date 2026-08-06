import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import type { AdminMutationContext } from "../admin.types.js";
import {
  categoryInactive,
  categoryNotFound,
  isUniqueConflict,
  siteAlreadyDeleted,
  siteNotDeleted,
  siteNotDraft,
  siteNotFound,
  siteNotPublished,
  slugConflict
} from "./site.service.js";
import type {
  AdminSiteListQuery,
  AdminSiteRecord,
  CreateAdminSiteInput,
  UpdateAdminSiteInput
} from "./site.types.js";
import {
  reportSiteCreateDraftFailure,
  type SiteCreateDraftDiagnostics,
  type SiteCreateDraftStage
} from "./site-create-observability.js";

const DIRECT_PAGES_SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000901";

export interface AdminSiteRepository {
  createDraft(input: CreateAdminSiteInput, context: AdminMutationContext): Promise<AdminSiteRecord>;
  getSite(id: string): Promise<AdminSiteRecord | null>;
  listSites(query: AdminSiteListQuery, includeDeleted: boolean): Promise<{
    rows: AdminSiteRecord[];
    total: number;
  }>;
  permanentlyDeleteSite(id: string, context: AdminMutationContext): Promise<void>;
  publishSite(id: string, context: AdminMutationContext): Promise<AdminSiteRecord>;
  restoreSite(id: string, context: AdminMutationContext): Promise<AdminSiteRecord>;
  softDeleteSite(id: string, context: AdminMutationContext): Promise<AdminSiteRecord>;
  unpublishSite(id: string, context: AdminMutationContext): Promise<AdminSiteRecord>;
  updateSite(
    id: string,
    input: UpdateAdminSiteInput,
    context: AdminMutationContext
  ): Promise<AdminSiteRecord>;
}

const siteSelect = {
  active: true,
  category: {
    select: {
      id: true,
      slug: true,
      title: true
    }
  },
  categoryId: true,
  createdAt: true,
  deletedAt: true,
  deliveryLabel: true,
  demoLocalUrl: true,
  demoMode: true,
  demoUrl: true,
  developmentDays: true,
  externalDemoUrl: true,
  featured: true,
  features: true,
  fullDescription: true,
  galleryImages: true,
  id: true,
  legacyTitle: true,
  originalDemoUrl: true,
  previewImageUrl: true,
  previewType: true,
  priceAmountCents: true,
  priceLabel: true,
  publishedAt: true,
  shortDescription: true,
  siteUrl: true,
  slug: true,
  sortOrder: true,
  status: true,
  tags: true,
  title: true,
  updatedAt: true,
  views: true
} satisfies Prisma.SiteSelect;

export function createPrismaAdminSiteRepository(
  options: { diagnostics?: SiteCreateDraftDiagnostics; prisma: PrismaClient }
): AdminSiteRepository {
  const prisma = options.prisma;

  return {
    async createDraft(input, context) {
      let stage: SiteCreateDraftStage = "CATEGORY_LOOKUP_STARTED";
      let transactionCallbackCompleted = false;
      const startedAt = Date.now();
      const setStage = (nextStage: SiteCreateDraftStage): void => {
        stage = nextStage;
      };

      try {
        const site = await prisma.$transaction(async (tx) => {
          setStage("CATEGORY_LOOKUP_STARTED");
          await assertCategoryIsActive(tx, input.categoryId);
          setStage("CATEGORY_LOOKUP_COMPLETED");

          setStage("SITE_INSERT_STARTED");
          const site = await tx.site.create({
            data: {
              active: true,
              categoryId: input.categoryId,
              deletedAt: null,
              deliveryLabel: input.deliveryLabel ?? null,
              demoLocalUrl: input.demoLocalUrl ?? null,
              demoMode: input.demoMode ?? null,
              demoUrl: input.demoUrl ?? null,
              developmentDays: input.developmentDays ?? null,
              externalDemoUrl: input.externalDemoUrl ?? null,
              featured: false,
              features: input.features ?? [],
              fullDescription: input.fullDescription ?? null,
              galleryImages: [],
              legacyTitle: input.legacyTitle ?? null,
              originalDemoUrl: input.originalDemoUrl ?? null,
              previewImageUrl: null,
              previewType: input.previewType ?? null,
              priceAmountCents: input.priceAmountCents ?? null,
              priceLabel: input.priceLabel ?? null,
              publishedAt: null,
              shortDescription: input.shortDescription,
              siteUrl: input.siteUrl ?? null,
              slug: input.slug,
              sortOrder: input.sortOrder ?? 0,
              status: "draft",
              tags: input.tags ?? [],
              title: input.title,
              views: 0
            },
            select: siteSelect
          });
          setStage("SITE_INSERT_COMPLETED");

          setStage("AUDIT_INSERT_STARTED");
          await createSiteAudit(tx, {
            action: "site.create_draft",
            afterJson: siteSnapshot(site),
            beforeJson: Prisma.DbNull,
            context,
            entityId: site.id
          });
          setStage("AUDIT_INSERT_COMPLETED");

          setStage("TRANSACTION_COMMIT_PENDING");
          transactionCallbackCompleted = true;
          return site as AdminSiteRecord;
        });

        setStage("REQUEST_COMPLETED");

        return site;
      } catch (error) {
        reportSiteCreateDraftFailure(options.diagnostics, {
          elapsedMs: Date.now() - startedAt,
          error,
          requestId: context.requestId,
          stage,
          transactionCallbackCompleted
        });

        if (isUniqueConflict(error)) {
          throw slugConflict();
        }

        throw error;
      }
    },
    async getSite(id) {
      const site = await prisma.site.findUnique({
        select: siteSelect,
        where: { id }
      });

      return site as AdminSiteRecord | null;
    },
    async listSites(query, includeDeleted) {
      const where = createListWhere(query, includeDeleted);
      const orderBy = [
        { [query.sort]: query.direction },
        { id: query.direction }
      ] satisfies Prisma.SiteOrderByWithRelationInput[];
      const [total, rows] = await prisma.$transaction([
        prisma.site.count({ where }),
        prisma.site.findMany({
          orderBy,
          select: siteSelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where
        })
      ]);

      return { rows: rows as AdminSiteRecord[], total };
    },
    async permanentlyDeleteSite(id, context) {
      await prisma.$transaction(async (tx) => {
        const before = await tx.site.findUnique({
          select: siteSelect,
          where: { id }
        });

        if (before === null) {
          throw siteNotFound();
        }
        if (before.deletedAt === null) {
          throw siteNotDeleted();
        }

        await tx.site.delete({ where: { id } });
        await createSiteAudit(tx, {
          action: "site.permanent_delete",
          afterJson: Prisma.DbNull,
          beforeJson: siteSnapshot(before as AdminSiteRecord),
          context,
          entityId: id
        });
      });
    },
    async publishSite(id, context) {
      return lifecycleUpdate(prisma, id, context, {
        action: "site.publish",
        assert: async (tx, before) => {
          if (before.status !== "draft") {
            throw siteNotDraft();
          }
          if (before.previewImageUrl === null || before.previewImageUrl.trim() === "") {
            throw new AppError({
              code: "SITE_PREVIEW_REQUIRED",
              message: "Site preview is required.",
              statusCode: 409
            });
          }
          await assertCategoryIsActive(tx, before.categoryId);
        },
        data: {
          active: true,
          deletedAt: null,
          publishedAt: context.now,
          status: "published"
        },
        where: {
          deletedAt: null,
          id,
          status: "draft"
        }
      });
    },
    async restoreSite(id, context) {
      return lifecycleUpdate(prisma, id, context, {
        action: "site.restore",
        assert: (_tx, before) => {
          if (before.deletedAt === null) {
            throw siteNotDeleted();
          }
        },
        data: {
          active: true,
          deletedAt: null,
          publishedAt: null,
          status: "draft"
        },
        where: {
          id,
          deletedAt: { not: null }
        }
      });
    },
    async softDeleteSite(id, context) {
      return lifecycleUpdate(prisma, id, context, {
        action: "site.soft_delete",
        assert: (_tx, before) => {
          if (before.deletedAt !== null) {
            throw siteAlreadyDeleted();
          }
        },
        data: {
          active: false,
          deletedAt: context.now,
          publishedAt: null,
          status: "draft"
        },
        where: {
          deletedAt: null,
          id
        }
      });
    },
    async unpublishSite(id, context) {
      return lifecycleUpdate(prisma, id, context, {
        action: "site.unpublish",
        assert: (_tx, before) => {
          if (before.status !== "published") {
            throw siteNotPublished();
          }
        },
        data: {
          active: true,
          publishedAt: null,
          status: "draft"
        },
        where: {
          deletedAt: null,
          id,
          status: "published"
        }
      });
    },
    async updateSite(id, input, context) {
      try {
        return await prisma.$transaction(async (tx) => {
          const before = await tx.site.findUnique({
            select: siteSelect,
            where: { id }
          });

          if (before === null) {
            throw siteNotFound();
          }
          if (before.deletedAt !== null) {
            throw siteAlreadyDeleted();
          }
          if (input.categoryId !== undefined) {
            await assertCategoryIsActive(tx, input.categoryId);
          }

          const after = await tx.site.update({
            data: toSiteUpdateData(input),
            select: siteSelect,
            where: { id }
          });

          await createSiteAudit(tx, {
            action: "site.update",
            afterJson: changedSiteFields(before as AdminSiteRecord, after as AdminSiteRecord),
            beforeJson: changedSiteFields(after as AdminSiteRecord, before as AdminSiteRecord),
            context,
            entityId: id
          });

          return after as AdminSiteRecord;
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

async function lifecycleUpdate(
  prisma: PrismaClient,
  id: string,
  context: AdminMutationContext,
  options: {
    action: string;
    assert: (
      tx: Prisma.TransactionClient,
      before: AdminSiteRecord
    ) => Promise<void> | void;
    data: Prisma.SiteUpdateManyMutationInput;
    where: Prisma.SiteWhereInput;
  }
): Promise<AdminSiteRecord> {
  return prisma.$transaction(async (tx) => {
    const before = (await tx.site.findUnique({
      select: siteSelect,
      where: { id }
    })) as AdminSiteRecord | null;

    if (before === null) {
      throw siteNotFound();
    }

    await options.assert(tx, before);

    const updated = await tx.site.updateMany({
      data: options.data,
      where: options.where
    });

    if (updated.count !== 1) {
      throw before.deletedAt === null ? siteNotFound() : siteAlreadyDeleted();
    }

    const after = (await tx.site.findUniqueOrThrow({
      select: siteSelect,
      where: { id }
    })) as AdminSiteRecord;

    await createSiteAudit(tx, {
      action: options.action,
      afterJson: lifecycleSnapshot(after),
      beforeJson: lifecycleSnapshot(before),
      context,
      entityId: id
    });
    await createSiteAudit(tx, {
      action: "public_catalog.dirty",
      afterJson: Prisma.DbNull,
      beforeJson: Prisma.DbNull,
      context,
      entityId: id
    });

    return after;
  });
}

export function createAdminSiteListWhere(
  query: AdminSiteListQuery,
  includeDeleted: boolean
): Prisma.SiteWhereInput {
  return {
    ...(includeDeleted
      ? query.deleted === "only"
        ? { deletedAt: { not: null } }
        : query.deleted === "without"
          ? { deletedAt: null }
          : {}
      : { deletedAt: null }),
    ...(query.active === undefined ? {} : { active: query.active }),
    ...(query.category === undefined ? {} : { categoryId: query.category }),
    ...(query.featured === undefined ? {} : { featured: query.featured }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.search === undefined
      ? {}
      : {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { shortDescription: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } }
          ]
        })
  };
}

function createListWhere(
  query: AdminSiteListQuery,
  includeDeleted: boolean
): Prisma.SiteWhereInput {
  return createAdminSiteListWhere(query, includeDeleted);
}

function toSiteUpdateData(input: UpdateAdminSiteInput): Prisma.SiteUpdateInput {
  return {
    ...(input.categoryId === undefined ? {} : { category: { connect: { id: input.categoryId } } }),
    ...(input.deliveryLabel === undefined ? {} : { deliveryLabel: input.deliveryLabel }),
    ...(input.demoLocalUrl === undefined ? {} : { demoLocalUrl: input.demoLocalUrl }),
    ...(input.demoMode === undefined ? {} : { demoMode: input.demoMode }),
    ...(input.demoUrl === undefined ? {} : { demoUrl: input.demoUrl }),
    ...(input.developmentDays === undefined ? {} : { developmentDays: input.developmentDays }),
    ...(input.externalDemoUrl === undefined ? {} : { externalDemoUrl: input.externalDemoUrl }),
    ...(input.featured === undefined ? {} : { featured: input.featured }),
    ...(input.features === undefined ? {} : { features: input.features }),
    ...(input.fullDescription === undefined ? {} : { fullDescription: input.fullDescription }),
    ...(input.legacyTitle === undefined ? {} : { legacyTitle: input.legacyTitle }),
    ...(input.originalDemoUrl === undefined ? {} : { originalDemoUrl: input.originalDemoUrl }),
    ...(input.previewType === undefined ? {} : { previewType: input.previewType }),
    ...(input.priceAmountCents === undefined ? {} : { priceAmountCents: input.priceAmountCents }),
    ...(input.priceLabel === undefined ? {} : { priceLabel: input.priceLabel }),
    ...(input.shortDescription === undefined ? {} : { shortDescription: input.shortDescription }),
    ...(input.siteUrl === undefined ? {} : { siteUrl: input.siteUrl }),
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(input.title === undefined ? {} : { title: input.title })
  };
}

async function assertCategoryIsActive(
  tx: Prisma.TransactionClient,
  categoryId: string
): Promise<void> {
  const category = await tx.category.findUnique({
    select: { active: true },
    where: { id: categoryId }
  });

  if (category === null) {
    throw categoryNotFound();
  }
  if (!category.active) {
    throw categoryInactive();
  }
}

async function createSiteAudit(
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
      actorUserId: input.context.actor.id === DIRECT_PAGES_SYSTEM_ACTOR_ID
        ? null
        : input.context.actor.id,
      afterJson: input.afterJson,
      beforeJson: input.beforeJson,
      entityId: input.entityId,
      entityType: "site",
      ipHash: null,
      requestId: input.context.requestId,
      userAgentHash: null
    }
  });
}

function siteSnapshot(site: AdminSiteRecord): Prisma.InputJsonValue {
  return {
    active: site.active,
    categoryId: site.categoryId,
    featured: site.featured,
    id: site.id,
    publishedAt: site.publishedAt?.toISOString() ?? null,
    slug: site.slug,
    status: site.status,
    title: site.title
  };
}

function lifecycleSnapshot(site: AdminSiteRecord): Prisma.InputJsonValue {
  return {
    active: site.active,
    deletedAt: site.deletedAt?.toISOString() ?? null,
    id: site.id,
    publishedAt: site.publishedAt?.toISOString() ?? null,
    status: site.status
  };
}

function changedSiteFields(from: AdminSiteRecord, to: AdminSiteRecord): Prisma.InputJsonValue {
  const changed: Record<string, unknown> = {};

  for (const key of [
    "categoryId",
    "deliveryLabel",
    "demoLocalUrl",
    "demoMode",
    "demoUrl",
    "developmentDays",
    "externalDemoUrl",
    "featured",
    "features",
    "fullDescription",
    "galleryImages",
    "legacyTitle",
    "originalDemoUrl",
    "previewImageUrl",
    "previewType",
    "priceAmountCents",
    "priceLabel",
    "shortDescription",
    "siteUrl",
    "slug",
    "sortOrder",
    "tags",
    "title"
  ] as const) {
    if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
      changed[key] = to[key];
    }
  }

  return changed as Prisma.InputJsonValue;
}
