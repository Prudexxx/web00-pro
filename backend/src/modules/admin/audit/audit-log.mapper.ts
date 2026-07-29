import type {
  AdminAuditLogEntry,
  AdminAuditLogRecord
} from "./audit-log.types.js";

export function mapAdminAuditLog(record: AdminAuditLogRecord): AdminAuditLogEntry {
  return {
    action: record.action,
    actor:
      record.actor === null
        ? null
        : {
            email: record.actor.email,
            id: record.actor.id,
            role: record.actor.role === "admin" ? "admin" : "editor"
          },
    afterJson: record.afterJson,
    beforeJson: record.beforeJson,
    createdAt: record.createdAt.toISOString(),
    entityId: record.entityId,
    entityType: toEntityType(record.entityType),
    id: record.id,
    requestId: record.requestId
  };
}

function toEntityType(value: string): AdminAuditLogEntry["entityType"] {
  if (
    value === "auth" ||
    value === "category" ||
    value === "site" ||
    value === "upload" ||
    value === "user"
  ) {
    return value;
  }

  return "site";
}
