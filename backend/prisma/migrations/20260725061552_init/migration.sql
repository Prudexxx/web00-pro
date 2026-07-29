CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "replaced_by_session_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "legacy_title" TEXT,
    "short_description" TEXT NOT NULL,
    "full_description" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demo_url" TEXT,
    "site_url" TEXT,
    "preview_image_url" TEXT,
    "gallery_images" JSONB NOT NULL DEFAULT '[]',
    "preview_type" TEXT,
    "demo_mode" TEXT,
    "demo_local_url" TEXT,
    "external_demo_url" TEXT,
    "original_demo_url" TEXT,
    "price_amount_cents" INTEGER,
    "price_label" TEXT,
    "development_days" INTEGER,
    "delivery_label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "request_id" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_cleanup_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_path" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "storage_cleanup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_active_role" ON "users"("active", "role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_replaced_by_session_id_key" ON "refresh_sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "idx_refresh_sessions_user_expires" ON "refresh_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "idx_refresh_sessions_family_revoked" ON "refresh_sessions"("family_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "idx_categories_active_sort_order" ON "categories"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "sites_slug_key" ON "sites"("slug");

-- CreateIndex
CREATE INDEX "idx_sites_status_active_deleted" ON "sites"("status", "active", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_sites_category_public" ON "sites"("category_id", "status", "active", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_sites_featured_order" ON "sites"("featured", "views", "sort_order", "created_at");

-- CreateIndex
CREATE INDEX "idx_sites_tags_gin" ON "sites" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "idx_sites_features_gin" ON "sites" USING GIN ("features");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor_created" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action_created" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "idx_storage_cleanup_jobs_status_run_after" ON "storage_cleanup_jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "idx_storage_cleanup_jobs_entity" ON "storage_cleanup_jobs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'editor')),
  ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email"));

ALTER TABLE "sites"
  ADD CONSTRAINT "sites_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT "sites_views_non_negative_check" CHECK ("views" >= 0),
  ADD CONSTRAINT "sites_price_positive_check" CHECK ("price_amount_cents" IS NULL OR "price_amount_cents" > 0),
  ADD CONSTRAINT "sites_development_days_positive_check" CHECK ("development_days" IS NULL OR "development_days" > 0),
  ADD CONSTRAINT "sites_demo_mode_check" CHECK ("demo_mode" IS NULL OR "demo_mode" IN ('none', 'external-iframe'));

ALTER TABLE "storage_cleanup_jobs"
  ADD CONSTRAINT "storage_cleanup_jobs_status_check" CHECK ("status" IN ('pending', 'processing', 'completed', 'failed')),
  ADD CONSTRAINT "storage_cleanup_jobs_attempts_non_negative_check" CHECK ("attempts" >= 0);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_entity_type_check" CHECK ("entity_type" IN ('site', 'category', 'user', 'upload', 'auth'));
