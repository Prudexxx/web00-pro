CREATE TABLE "public_catalog_settings" (
  "id" TEXT NOT NULL,
  "show_demo_in_modal" BOOLEAN NOT NULL DEFAULT true,
  "auto_publish" BOOLEAN NOT NULL DEFAULT true,
  "desired_revision" INTEGER NOT NULL DEFAULT 1,
  "active_revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_catalog_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_settings_singleton_id_chk" CHECK ("id" = 'public-catalog'),
  CONSTRAINT "public_catalog_settings_revision_chk" CHECK ("desired_revision" >= 1 AND "active_revision" >= 0 AND "desired_revision" >= "active_revision")
);

CREATE TABLE "site_image_assets" (
  "asset_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "slot" TEXT NOT NULL,
  "source_sha256" CHAR(64) NOT NULL,
  "source_mime" TEXT NOT NULL,
  "decoded_format" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "variants" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_image_assets_pkey" PRIMARY KEY ("asset_id"),
  CONSTRAINT "site_image_assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_image_assets_site_asset_slot_key" UNIQUE ("site_id", "asset_id", "slot"),
  CONSTRAINT "site_image_assets_slot_chk" CHECK ("slot" IN ('preview', 'gallery')),
  CONSTRAINT "site_image_assets_source_sha256_chk" CHECK ("source_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "site_image_assets_dimensions_chk" CHECK ("width" > 0 AND "height" > 0)
);

ALTER TABLE "sites"
  ADD COLUMN "preview_asset_id" UUID;

CREATE TABLE "site_preview_images" (
  "site_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "slot" TEXT NOT NULL DEFAULT 'preview',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_preview_images_pkey" PRIMARY KEY ("site_id"),
  CONSTRAINT "site_preview_images_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_preview_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "site_preview_images_slot_chk" CHECK ("slot" = 'preview')
);

CREATE TABLE "site_gallery_images" (
  "site_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "slot" TEXT NOT NULL DEFAULT 'gallery',
  "sort_order" INTEGER NOT NULL,
  "alt" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_gallery_images_pkey" PRIMARY KEY ("site_id", "asset_id"),
  CONSTRAINT "site_gallery_images_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_gallery_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_gallery_images_slot_chk" CHECK ("slot" = 'gallery'),
  CONSTRAINT "site_gallery_images_sort_order_chk" CHECK ("sort_order" >= 0),
  CONSTRAINT "site_gallery_images_site_sort_order_key" UNIQUE ("site_id", "sort_order")
);

CREATE TABLE "public_catalog_publication_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "idempotency_key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "projection_hash" CHAR(64),
  "operation_scope" TEXT NOT NULL,
  "operation_group_key" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "actor_user_id" UUID,
  "site_id" UUID,
  "target_revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "lease_id" TEXT,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "last_checkpoint" JSONB NOT NULL DEFAULT '{}',
  "last_error_code" TEXT,
  "request_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "public_catalog_publication_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_publication_operations_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "public_catalog_publication_operations_action_chk" CHECK ("action" IN ('publish', 'unpublish', 'settings_publish', 'reconcile')),
  CONSTRAINT "public_catalog_publication_operations_status_chk" CHECK ("status" IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "public_catalog_publication_operations_fingerprint_chk" CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$' AND ("projection_hash" IS NULL OR "projection_hash" ~ '^[a-f0-9]{64}$')),
  CONSTRAINT "public_catalog_publication_operations_retry_count_chk" CHECK ("retry_count" >= 0),
  CONSTRAINT "public_catalog_publication_operations_target_revision_chk" CHECK ("target_revision" >= 1)
);

CREATE UNIQUE INDEX "public_catalog_publication_operations_active_group_key"
  ON "public_catalog_publication_operations" ("operation_group_key")
  -- nonterminal operation coalescing
  WHERE "status" IN ('queued', 'running', 'retry_wait');

CREATE TABLE "public_catalog_releases" (
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "items_count" INTEGER NOT NULL,
  "chunks_count" INTEGER NOT NULL,
  "popular_count" INTEGER NOT NULL,
  "manifest_path" TEXT NOT NULL,
  "manifest_sha256" CHAR(64) NOT NULL,
  "index_path" TEXT NOT NULL,
  "index_sha256" CHAR(64) NOT NULL,
  "popular_path" TEXT NOT NULL,
  "popular_sha256" CHAR(64) NOT NULL,
  "categories_path" TEXT NOT NULL,
  "categories_sha256" CHAR(64) NOT NULL,
  "active_pointer_sha256" CHAR(64),
  "generated_at" TIMESTAMPTZ(6) NOT NULL,
  "activated_at" TIMESTAMPTZ(6),
  CONSTRAINT "public_catalog_releases_pkey" PRIMARY KEY ("revision"),
  CONSTRAINT "public_catalog_releases_status_chk" CHECK ("status" IN ('building', 'verified', 'active', 'superseded', 'failed')),
  CONSTRAINT "public_catalog_releases_counts_chk" CHECK ("items_count" >= 0 AND "chunks_count" >= 0 AND "popular_count" >= 0)
);

CREATE TABLE "public_catalog_activation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" UUID,
  "event_type" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previous_revision" INTEGER,
  "active_pointer_sha256" CHAR(64) NOT NULL,
  "request_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_catalog_activation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_activation_events_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "public_catalog_activation_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public_catalog_publication_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_revision_fkey" FOREIGN KEY ("revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_previous_revision_fkey" FOREIGN KEY ("previous_revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_type_chk" CHECK ("event_type" IN ('activate', 'rollback', 'reconcile'))
);
