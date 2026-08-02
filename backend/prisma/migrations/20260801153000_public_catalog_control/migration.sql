CREATE TABLE "public_catalog_control" (
  "id" text NOT NULL,
  "show_demo_in_modal" boolean NOT NULL DEFAULT false,
  "desired_revision" integer NOT NULL DEFAULT 1,
  "published_revision" integer NOT NULL DEFAULT 0,
  "sync_status" text NOT NULL DEFAULT 'pending',
  "current_snapshot_path" text,
  "current_snapshot_checksum" text,
  "current_snapshot_generated_at" timestamptz(6),
  "current_items_count" integer,
  "last_sync_error_code" text,
  "last_sync_request_id" text,
  "sync_lease_id" text,
  "sync_lease_expires_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_catalog_control_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_control_singleton_id_chk"
    CHECK ("id" = 'public-catalog'),
  CONSTRAINT "public_catalog_control_revision_chk"
    CHECK (
      "desired_revision" >= 1
      AND "published_revision" >= 0
      AND "desired_revision" >= "published_revision"
    ),
  CONSTRAINT "public_catalog_control_sync_status_chk"
    CHECK ("sync_status" IN ('pending', 'syncing', 'ready', 'failed')),
  CONSTRAINT "public_catalog_control_snapshot_count_chk"
    CHECK ("current_items_count" IS NULL OR "current_items_count" >= 0),
  CONSTRAINT "public_catalog_control_snapshot_checksum_chk"
    CHECK (
      "current_snapshot_checksum" IS NULL
      OR "current_snapshot_checksum" ~ '^[a-f0-9]{64}$'
    )
);

CREATE INDEX "idx_public_catalog_control_sync_status"
  ON "public_catalog_control" ("sync_status");

CREATE INDEX "idx_public_catalog_control_sync_lease_expires_at"
  ON "public_catalog_control" ("sync_lease_expires_at");
