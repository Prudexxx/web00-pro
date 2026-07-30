import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../../auth/auth.types.js";
import type { AdminMutationContext } from "../admin.types.js";
import { createPermissionPolicy } from "../rbac.policy.js";
import type { PermissionPolicy } from "../rbac.types.js";
import { mapAdminSiteDetail, mapAdminSiteList } from "./site.mapper.js";
import type { AdminSiteRepository } from "./site.repository.js";
import type {
  AdminSiteDetail,
  AdminSiteListQuery,
  AdminSiteListResponse,
  CreateAdminSiteInput,
  SiteLifecycleRecord,
  UpdateAdminSiteInput
} from "./site.types.js";

export interface AdminSiteService {
  createDraft(
    input: CreateAdminSiteInput,
    context: AdminMutationContext
  ): Promise<AdminSiteDetail>;
  deleteSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  getSite(id: string, principal: AuthenticatedPrincipal): Promise<AdminSiteDetail>;
  listSites(
    query: AdminSiteListQuery,
    principal: AuthenticatedPrincipal
  ): Promise<AdminSiteListResponse>;
  permanentlyDeleteSite(id: string, context: AdminMutationContext): Promise<void>;
  publishSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  restoreSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  unpublishSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  updateSite(
    id: string,
    input: UpdateAdminSiteInput,
    context: AdminMutationContext
  ): Promise<AdminSiteDetail>;
}

export function createAdminSiteService(options: {
  now?: () => Date;
  repository: AdminSiteRepository;
}): AdminSiteService {
  const policy = createPermissionPolicy();

  return {
    async createDraft(input, context) {
      return mapAdminSiteDetail(
        await options.repository.createDraft(input, context),
        context.actor.role
      );
    },
    async deleteSite(id, context) {
      return mapAdminSiteDetail(
        await options.repository.softDeleteSite(id, context),
        context.actor.role
      );
    },
    async getSite(id, principal) {
      const site = await options.repository.getSite(id);

      if (site === null || (!policy.has(principal.role, "site.softDelete") && site.deletedAt !== null)) {
        throw siteNotFound();
      }

      return mapAdminSiteDetail(site, principal.role);
    },
    async listSites(query, principal) {
      const includeDeleted = policy.has(principal.role, "site.softDelete");
      const result = await options.repository.listSites(query, includeDeleted);

      return {
        data: mapAdminSiteList(result.rows, principal.role),
        meta: {
          limit: query.limit,
          page: query.page,
          total: result.total,
          totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit)
        }
      };
    },
    async permanentlyDeleteSite(id, context) {
      await options.repository.permanentlyDeleteSite(id, context);
    },
    async publishSite(id, context) {
      return mapAdminSiteDetail(
        await options.repository.publishSite(id, context),
        context.actor.role
      );
    },
    async restoreSite(id, context) {
      return mapAdminSiteDetail(
        await options.repository.restoreSite(id, context),
        context.actor.role
      );
    },
    async unpublishSite(id, context) {
      return mapAdminSiteDetail(
        await options.repository.unpublishSite(id, context),
        context.actor.role
      );
    },
    async updateSite(id, input, context) {
      const current = await options.repository.getSite(id);

      if (current === null) {
        throw siteNotFound();
      }
      assertCanUpdateSite(context.actor, current, input, policy);

      return mapAdminSiteDetail(
        await options.repository.updateSite(id, input, context),
        context.actor.role
      );
    }
  };
}

export function assertCanUpdateSite(
  principal: AuthenticatedPrincipal,
  site: SiteLifecycleRecord,
  patch: UpdateAdminSiteInput,
  policy: PermissionPolicy = createPermissionPolicy()
): void {
  if (site.deletedAt !== null) {
    throw siteAlreadyDeleted();
  }

  const requiresAny = site.status !== "draft" || patch.featured !== undefined;
  const requiredPermission = requiresAny ? "site.updateAny" : "site.updateDraft";

  if (!policy.has(principal.role, requiredPermission)) {
    throw forbidden();
  }
}

export function forbidden(): AppError {
  return new AppError({
    code: "FORBIDDEN",
    message: "Forbidden.",
    statusCode: 403
  });
}

export function siteNotFound(): AppError {
  return new AppError({
    code: "SITE_NOT_FOUND",
    message: "Site not found.",
    statusCode: 404
  });
}

export function categoryNotFound(): AppError {
  return new AppError({
    code: "CATEGORY_NOT_FOUND",
    message: "Category not found.",
    statusCode: 404
  });
}

export function siteNotDraft(): AppError {
  return new AppError({
    code: "SITE_NOT_DRAFT",
    message: "Site must be a draft before publishing.",
    statusCode: 409
  });
}

export function siteNotPublished(): AppError {
  return new AppError({
    code: "SITE_NOT_PUBLISHED",
    message: "Site must be published before unpublishing.",
    statusCode: 409
  });
}

export function siteAlreadyDeleted(): AppError {
  return new AppError({
    code: "SITE_ALREADY_DELETED",
    message: "Site is deleted.",
    statusCode: 410
  });
}

export function siteNotDeleted(): AppError {
  return new AppError({
    code: "SITE_NOT_DELETED",
    message: "Site is not deleted.",
    statusCode: 409
  });
}

export function categoryInactive(): AppError {
  return new AppError({
    code: "CATEGORY_INACTIVE",
    message: "Category is inactive.",
    statusCode: 409
  });
}

export function slugConflict(): AppError {
  return new AppError({
    code: "SLUG_CONFLICT",
    message: "Slug already exists.",
    statusCode: 409
  });
}

export function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      "code" in error &&
      error.name === "PrismaClientKnownRequestError"
    )
  ) && (error as { code?: unknown }).code === "P2002";
}
