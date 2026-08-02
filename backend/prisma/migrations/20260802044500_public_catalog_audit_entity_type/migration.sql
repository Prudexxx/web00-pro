ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_entity_type_check";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_entity_type_check"
  CHECK (
    "entity_type" IN (
      'site',
      'category',
      'user',
      'upload',
      'auth',
      'public_catalog'
    )
  );
