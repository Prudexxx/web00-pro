import { AppError } from "../../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../../auth/auth.types.js";
import type { PublicCatalogReconciler } from "../../public-catalog/public-catalog-reconciler.js";
import type { AdminMutationContext } from "../admin.types.js";
import { createPermissionPolicy } from "../rbac.policy.js";
import { categoryNotFound } from "../sites/site.service.js";
import { mapAdminCategoryDetail, mapAdminCategoryList } from "./category.mapper.js";
import type { AdminCategoryRepository } from "./category.repository.js";
import type {
  AdminCategoryDetail,
  AdminCategoryListQuery,
  AdminCategoryListResponse,
  CreateAdminCategoryInput,
  UpdateAdminCategoryInput
} from "./category.types.js";

export interface AdminCategoryService {
  createCategory(
    input: CreateAdminCategoryInput,
    context: AdminMutationContext
  ): Promise<AdminCategoryDetail>;
  deleteCategory(id: string, context: AdminMutationContext): Promise<void>;
  getCategory(id: string, principal: AuthenticatedPrincipal): Promise<AdminCategoryDetail>;
  listCategories(
    query: AdminCategoryListQuery,
    principal: AuthenticatedPrincipal
  ): Promise<AdminCategoryListResponse>;
  updateCategory(
    id: string,
    input: UpdateAdminCategoryInput,
    context: AdminMutationContext
  ): Promise<AdminCategoryDetail>;
}

export function createAdminCategoryService(
  options: {
    publicCatalogReconciler?: Pick<PublicCatalogReconciler, "requestReconcile">;
    repository: AdminCategoryRepository;
  }
): AdminCategoryService {
  const policy = createPermissionPolicy();

  return {
    async createCategory(input, context) {
      return mapAdminCategoryDetail(
        await options.repository.createCategory(input, context),
        context.actor.role
      );
    },
    async deleteCategory(id, context) {
      try {
        await options.repository.deleteCategory(id, context);
      } catch (error) {
        if (error instanceof Error && error.message === "CATEGORY_IN_USE") {
          throw new AppError({
            code: "CATEGORY_IN_USE",
            message: "Category is in use.",
            statusCode: 409
          });
        }

        throw error;
      }
    },
    async getCategory(id, principal) {
      const category = await options.repository.getCategory(id);

      if (category === null || (!policy.has(principal.role, "category.create") && !category.active)) {
        throw categoryNotFound();
      }

      return mapAdminCategoryDetail(category, principal.role);
    },
    async listCategories(query, principal) {
      const includeInactive = policy.has(principal.role, "category.create");
      const result = await options.repository.listCategories(query, includeInactive);

      return {
        data: mapAdminCategoryList(result.rows, principal.role),
        meta: {
          limit: query.limit,
          page: query.page,
          total: result.total,
          totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit)
        }
      };
    },
    async updateCategory(id, input, context) {
      const record = await options.repository.updateCategory(id, input, context);
      options.publicCatalogReconciler?.requestReconcile({
        reason: "category.update",
        requestId: context.requestId
      });
      return mapAdminCategoryDetail(record, context.actor.role);
    }
  };
}
