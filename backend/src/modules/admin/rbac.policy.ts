import type { AuthRole } from "../auth/auth.types.js";
import type { B5Permission, PermissionPolicy } from "./rbac.types.js";

export const B5_PERMISSIONS = [
  "site.read",
  "site.createDraft",
  "site.updateDraft",
  "site.updateAny",
  "site.publish",
  "site.unpublish",
  "site.softDelete",
  "site.restore",
  "site.permanentDelete",
  "category.read",
  "category.create",
  "category.update",
  "category.delete",
  "audit.read",
  "user.read",
  "user.changeRole",
  "user.disable",
  "user.enable",
  "maintenance.canonicalAssets",
  "maintenance.publicCatalog"
] as const satisfies readonly B5Permission[];

const EDITOR_PERMISSIONS = [
  "site.read",
  "site.createDraft",
  "site.updateDraft",
  "category.read"
] as const satisfies readonly B5Permission[];

const ADMIN_PERMISSIONS = B5_PERMISSIONS;
const approvedPermissionSet = new Set<string>(B5_PERMISSIONS);
const permissionsByRole = new Map<string, readonly B5Permission[]>([
  ["admin", ADMIN_PERMISSIONS],
  ["editor", EDITOR_PERMISSIONS]
]);

export function createPermissionPolicy(): PermissionPolicy {
  return {
    has: hasPermission,
    list: (role) => permissionsByRole.get(role) ?? []
  };
}

export function hasPermission(role: string, permission: B5Permission): boolean {
  if (!approvedPermissionSet.has(permission)) {
    return false;
  }

  return (permissionsByRole.get(role) ?? []).includes(permission);
}

export function permissionsForRole(role: AuthRole): readonly B5Permission[] {
  return permissionsByRole.get(role) ?? [];
}
