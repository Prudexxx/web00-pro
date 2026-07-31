export type B5Permission =
  | "site.read"
  | "site.createDraft"
  | "site.updateDraft"
  | "site.updateAny"
  | "site.publish"
  | "site.unpublish"
  | "site.softDelete"
  | "site.restore"
  | "site.permanentDelete"
  | "category.read"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "audit.read"
  | "user.read"
  | "user.changeRole"
  | "user.disable"
  | "user.enable"
  | "maintenance.canonicalAssets";

export interface PermissionPolicy {
  has(role: string, permission: B5Permission): boolean;
  list(role: string): readonly B5Permission[];
}
