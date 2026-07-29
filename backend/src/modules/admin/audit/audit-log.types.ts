import type { AdminPaginationMeta } from "../admin.types.js";

export type AuditLogSort = "newest" | "oldest";

export interface AdminAuditLogQuery {
  action?: string;
  actorUserId?: string;
  entityId?: string;
  entityType?: "auth" | "category" | "site" | "upload" | "user";
  from?: Date;
  limit: number;
  page: number;
  sort: AuditLogSort;
  to?: Date;
}

export interface AdminAuditLogRecord {
  action: string;
  actor: null | {
    email: string;
    id: string;
    role: string;
  };
  afterJson: unknown;
  beforeJson: unknown;
  createdAt: Date;
  entityId: string | null;
  entityType: string;
  id: string;
  requestId: string;
}

export interface AdminAuditLogResponse {
  data: AdminAuditLogEntry[];
  meta: AdminPaginationMeta;
}

export interface AdminAuditLogEntry {
  action: string;
  actor: null | {
    email: string;
    id: string;
    role: "admin" | "editor";
  };
  afterJson: unknown;
  beforeJson: unknown;
  createdAt: string;
  entityId: string | null;
  entityType: "auth" | "category" | "site" | "upload" | "user";
  id: string;
  requestId: string;
}
