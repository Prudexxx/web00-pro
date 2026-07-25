import type { AuthRole } from "../../auth/auth.types.js";
import type { AdminPaginationMeta } from "../admin.types.js";

export interface AdminUserRecord {
  active: boolean;
  createdAt: Date;
  email: string;
  id: string;
  lastLoginAt: Date | null;
  role: AuthRole;
  updatedAt: Date;
}

export interface SafeAdminUser {
  active: boolean;
  createdAt: string;
  email: string;
  id: string;
  lastLoginAt: string | null;
  role: AuthRole;
  updatedAt: string;
}

export interface AdminUserListQuery {
  active?: boolean;
  direction: "asc" | "desc";
  limit: number;
  page: number;
  role?: AuthRole;
  search?: string;
  sort: "createdAt" | "updatedAt" | "email" | "role" | "lastLoginAt";
}

export interface AdminUserListResponse {
  data: SafeAdminUser[];
  meta: AdminPaginationMeta;
}

export interface UserMutationContext {
  actorUserId: string | null;
  now: Date;
  requestId: string;
  source: "api" | "cli";
}

export interface UserMutationResult {
  sessionsRevoked: number;
  user: AdminUserRecord;
}
