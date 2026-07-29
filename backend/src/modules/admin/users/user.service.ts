import { AppError } from "../../../lib/errors.js";
import { mapSafeAdminUser, mapSafeAdminUsers } from "./user.mapper.js";
import type {
  AdminUserListQuery,
  AdminUserListResponse,
  SafeAdminUser,
  UserMutationContext
} from "./user.types.js";
import type { AdminUserRepository } from "./user.repository.js";

export interface AdminUserService {
  changeRole(
    id: string,
    role: "admin" | "editor",
    context: UserMutationContext
  ): Promise<SafeAdminUser>;
  disable(id: string, context: UserMutationContext): Promise<SafeAdminUser>;
  enable(id: string, context: UserMutationContext): Promise<SafeAdminUser>;
  getUser(id: string): Promise<SafeAdminUser>;
  listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse>;
}

export function createAdminUserService(options: {
  repository: AdminUserRepository;
}): AdminUserService {
  const repository = options.repository;

  return {
    async changeRole(id, role, context) {
      if (id === context.actorUserId) {
        throw selfRoleChangeForbidden();
      }

      return mapSafeAdminUser((await repository.changeRole({ context, id, role })).user);
    },
    async disable(id, context) {
      if (id === context.actorUserId) {
        throw selfDisableForbidden();
      }

      return mapSafeAdminUser((await repository.disable({ context, id })).user);
    },
    async enable(id, context) {
      return mapSafeAdminUser((await repository.enable({ context, id })).user);
    },
    async getUser(id) {
      const user = await repository.getUser(id);

      if (user === null) {
        throw userNotFound();
      }

      return mapSafeAdminUser(user);
    },
    async listUsers(query) {
      const result = await repository.listUsers(query);

      return {
        data: mapSafeAdminUsers(result.rows),
        meta: {
          limit: query.limit,
          page: query.page,
          total: result.total,
          totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit)
        }
      };
    }
  };
}

export function userNotFound(): AppError {
  return new AppError({
    code: "USER_NOT_FOUND",
    message: "User was not found.",
    statusCode: 404
  });
}

export function userRoleUnchanged(): AppError {
  return new AppError({
    code: "USER_ROLE_UNCHANGED",
    message: "User already has this role.",
    statusCode: 409
  });
}

export function userAlreadyDisabled(): AppError {
  return new AppError({
    code: "USER_ALREADY_DISABLED",
    message: "User is already disabled.",
    statusCode: 409
  });
}

export function userAlreadyActive(): AppError {
  return new AppError({
    code: "USER_ALREADY_ACTIVE",
    message: "User is already active.",
    statusCode: 409
  });
}

export function selfRoleChangeForbidden(): AppError {
  return new AppError({
    code: "SELF_ROLE_CHANGE_FORBIDDEN",
    message: "You cannot change your own role.",
    statusCode: 403
  });
}

export function selfDisableForbidden(): AppError {
  return new AppError({
    code: "SELF_DISABLE_FORBIDDEN",
    message: "You cannot disable your own user.",
    statusCode: 403
  });
}

export function lastActiveAdmin(): AppError {
  return new AppError({
    code: "LAST_ACTIVE_ADMIN",
    message: "At least one active admin must remain.",
    statusCode: 409
  });
}
