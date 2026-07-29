import type { AdminUserRecord, SafeAdminUser } from "./user.types.js";

export function mapSafeAdminUser(input: AdminUserRecord): SafeAdminUser {
  return {
    active: input.active,
    createdAt: input.createdAt.toISOString(),
    email: input.email,
    id: input.id,
    lastLoginAt: input.lastLoginAt?.toISOString() ?? null,
    role: input.role,
    updatedAt: input.updatedAt.toISOString()
  };
}

export function mapSafeAdminUsers(input: readonly AdminUserRecord[]): SafeAdminUser[] {
  return input.map(mapSafeAdminUser);
}
