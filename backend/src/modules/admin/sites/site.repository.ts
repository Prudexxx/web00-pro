import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import type { AdminMutationContext } from "../admin.types.js";
import { markPublicCatalogDirty } from "../../public-catalog/public-catalog-control.repository.js";
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

const SITE_CREATE_DRAFT_ACTION = "site.create_draft";
const DIRECT_PAGES_SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000901";
const DIRECT_PAGES_SYSTEM_ACTOR_EMAIL = "system@web00.local";
const CREATE_FINGERPRINT_FIELDS = [
  "categoryId",
  "deliveryLabel",
  "demoLocalUrl",
  "demoMode",
  "demoUrl",
  "developmentDays",
  "externalDemoUrl",
  "features",
  "fullDescription",
  "legacyTitle",
  "originalDemoUrl",
  "previewType",
  "priceAmountCents",
  "priceLabel",
  "shortDescription",
  "siteUrl",
  "slug",
  "sortOrder",
  "tags",
  "title"
] as const satisfies readonly (keyof CreateAdminSiteInput)[];

const PUBLIC_CATALOG_SITE_PROJECTION_FIELDS = [
  "categoryId",
  "deliveryLabel",
  "demoMode",
  "demoUrl",
  "developmentDays",
  "featured",
  "features",
  "fullDescription",
  "galleryImages",
  "previewImageUrl",
  "previewType",
  "priceAmountCents",
  "priceLabel",
  "publishedAt",
  "shortDescription",
  "siteUrl",
  "slug",
  "sortOrder",
  "tags",
  "title"
] as const satisfies readonly (keyof AdminSiteRecord)[];

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
      let stage: SiteCreateDraftStage = "IDEMPOTENCY_LOCK_STARTED";
      let transactionCallbackCompleted = false;
      const startedAt = Date.now();
      const setStage = (nextStage: SiteCreateDraftStage): void => {
        stage = nextStage;
      };

      try {
        const requestFingerprint = createSiteCreateRequestFingerprint(input);
        const site = await prisma.$transaction(async (tx) => {
          setStage("IDEMPOTENCY_LOCK_STARTED");
          await acquireCreateDraftIdempotencyLock(tx, context);
          setStage("IDEMPOTENCY_LOCK_COMPLETED");
          setStage("REPLAY_LOOKUP_STARTED");
          const replay = await resolveCreateDraftReplay(tx, {
            context,
            requestFingerprint
          });
          setStage("REPLAY_LOOKUP_COMPLETED");

          if (replay !== null) {
            setStage("TRANSACTION_COMMIT_PENDING");
            transactionCallbackCompleted = true;
            return replay;
          }

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
            action: SITE_CREATE_DRAFT_ACTION,
            afterJson: siteSnapshot(site, requestFingerprint),
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
      const where = createAdminSiteListWhere(query, includeDeleted);
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
        await markPublicCatalogDirty(
          tx,
          "site.permanentDelete",
          publicCatalogDirtyContext(context, { siteId: id })
        );
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

          if (
            hasPublicCatalogProjectionChange(
              before as AdminSiteRecord,
              after as AdminSiteRecord
            )
          ) {
            await markPublicCatalogDirty(
              tx,
              "site.update",
              publicCatalogDirtyContext(context, { siteId: id, slug: after.slug })
            );
          }

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

    if (hasPublicProjection(before) || hasPublicProjection(after)) {
      await markPublicCatalogDirty(
        tx,
        options.action,
        publicCatalogDirtyContext(context, { siteId: id, slug: after.slug })
      );
    }

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
      actorUserId: auditActorUserId(input.context),
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

async function acquireCreateDraftIdempotencyLock(
  tx: Prisma.TransactionClient,
  context: AdminMutationContext
): Promise<void> {
  const lockIdentity = `${context.actor.id}:${context.requestId}`;
  const rows = await tx.$queryRaw<Array<{ acquired: bigint | number }>>`
    WITH lock AS (
      SELECT pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))
    )
    SELECT 1::int AS acquired
    FROM lock
  `;

  if (!isExpectedCreateDraftLockRows(rows)) {
    throw malformedCreateDraftIdempotencyLockResult();
  }
}

function isExpectedCreateDraftLockRows(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return false;
  }

  const acquired = (rows[0] as { acquired?: unknown } | undefined)?.acquired;

  return acquired === 1 || acquired === 1n;
}

function malformedCreateDraftIdempotencyLockResult(): AppError {
  return new AppError({
    code: "INTERNAL_ERROR",
    message: "Internal server error.",
    statusCode: 500
  });
}

function auditActorUserId(context: AdminMutationContext): string | null {
  return isDirectPagesSystemActor(context) ? null : context.actor.id;
}

function publicCatalogDirtyContext(
  context: AdminMutationContext,
  reasonContext: Record<string, unknown>
): { actorUserId?: string; reasonContext: Record<string, unknown>; requestId: string } {
  const actorUserId = auditActorUserId(context);

  return {
    ...(actorUserId === null ? {} : { actorUserId }),
    reasonContext,
    requestId: context.requestId
  };
}

function isDirectPagesSystemActor(context: AdminMutationContext): boolean {
  return context.actor.id === DIRECT_PAGES_SYSTEM_ACTOR_ID &&
    context.actor.email === DIRECT_PAGES_SYSTEM_ACTOR_EMAIL;
}

async function resolveCreateDraftReplay(
  tx: Prisma.TransactionClient,
  input: {
    context: AdminMutationContext;
    requestFingerprint: string;
  }
): Promise<AdminSiteRecord | null> {
  const audit = await tx.auditLog.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      action: SITE_CREATE_DRAFT_ACTION,
      actorUserId: input.context.actor.id,
      entityType: "site",
      requestId: input.context.requestId
    }
  });

  if (audit === null) {
    return null;
  }

  const storedFingerprint = readStoredRequestFingerprint(audit.afterJson);

  if (storedFingerprint !== input.requestFingerprint) {
    throw idempotencyKeyReused();
  }

  const entityId = typeof audit.entityId === "string" ? audit.entityId : "";
  const site = await tx.site.findUnique({
    select: siteSelect,
    where: { id: entityId }
  });

  if (site === null) {
    throw idempotencyReplayUnavailable();
  }

  return site as AdminSiteRecord;
}

function createSiteCreateRequestFingerprint(input: CreateAdminSiteInput): string {
  const canonical = Object.fromEntries(
    CREATE_FINGERPRINT_FIELDS.map((field) => [field, normalizeFingerprintValue(input[field])])
  );

  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function normalizeFingerprintValue(value: unknown): unknown {
  if (value === undefined) {
    return { type: "undefined" };
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFingerprintValue);
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeFingerprintValue((value as Record<string, unknown>)[key])])
  );
}

function readStoredRequestFingerprint(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fingerprint = (value as Record<string, unknown>).requestFingerprint;

  return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint)
    ? fingerprint
    : null;
}

function idempotencyKeyReused(): AppError {
  return new AppError({
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "Операция сохранения уже использована с другими данными.",
    statusCode: 409
  });
}

function idempotencyReplayUnavailable(): AppError {
  return new AppError({
    code: "IDEMPOTENCY_REPLAY_UNAVAILABLE",
    message: "Не удалось восстановить результат предыдущего сохранения.",
    statusCode: 409
  });
}

function siteSnapshot(site: AdminSiteRecord, requestFingerprint?: string): Prisma.InputJsonValue {
  return {
    active: site.active,
    categoryId: site.categoryId,
    featured: site.featured,
    id: site.id,
    publishedAt: site.publishedAt?.toISOString() ?? null,
    ...(requestFingerprint === undefined ? {} : { requestFingerprint }),
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

function hasPublicProjection(site: Pick<AdminSiteRecord, "active" | "deletedAt" | "status">): boolean {
  return site.status === "published" && site.active && site.deletedAt === null;
}

function hasPublicCatalogProjectionChange(
  before: AdminSiteRecord,
  after: AdminSiteRecord
): boolean {
  const wasPublic = hasPublicProjection(before);
  const isPublic = hasPublicProjection(after);

  if (!wasPublic && !isPublic) {
    return false;
  }
  if (wasPublic !== isPublic) {
    return true;
  }

  return PUBLIC_CATALOG_SITE_PROJECTION_FIELDS.some(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );
}
