import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withTestClient } from "./test-database.js";

const requiredTables = [
  "users",
  "refresh_sessions",
  "categories",
  "sites",
  "audit_logs",
  "storage_cleanup_jobs"
];

const requiredCheckConstraints = [
  "users_role_check",
  "users_email_lowercase_check",
  "sites_status_check",
  "sites_views_non_negative_check",
  "sites_price_positive_check",
  "sites_development_days_positive_check",
  "sites_demo_mode_check",
  "storage_cleanup_jobs_status_check",
  "storage_cleanup_jobs_attempts_non_negative_check",
  "audit_logs_entity_type_check"
];
const canonicalSlugs = [
  "site-custom",
  "mebel",
  "odezhda",
  "doma-bani",
  "medicina",
  "narko-medicine",
  "uslugi",
  "cleaning",
  "advokat",
  "krovlya",
  "digital-projects",
  "ruberoid-roof",
  "rental-house",
  "massage",
  "drova"
];
const publishCanonicalMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260729120000_publish_canonical_catalog",
  "migration.sql"
);
const ownerCloneSlug = "drova-test-copy-20260729";

type MigrationSiteRow = {
  active: boolean;
  category_id: string;
  created_at: Date;
  deleted_at: Date | null;
  delivery_label: string | null;
  demo_local_url: string | null;
  demo_mode: string | null;
  demo_url: string | null;
  development_days: number | null;
  external_demo_url: string | null;
  featured: boolean;
  features: string[];
  full_description: string | null;
  gallery_images: unknown;
  id: string;
  legacy_title: string | null;
  original_demo_url: string | null;
  preview_image_url: string | null;
  preview_type: string | null;
  price_amount_cents: number | null;
  price_label: string | null;
  published_at: Date | null;
  short_description: string;
  site_url: string | null;
  slug: string;
  sort_order: number;
  status: string;
  tags: string[];
  title: string;
  updated_at: Date;
  views: number;
};

type MigrationSiteInput = {
  categoryId: string;
  index: number;
  publishedAt: Date | null;
  slug: string;
  status: "draft" | "published";
  title: string;
  updatedAt: Date;
};

describe("B2 PostgreSQL migration", () => {
  it("creates the six approved B0 tables", async () => {
    await withTestClient(async (client) => {
      const result = await client.query<{ tablename: string }>(
        `
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename = ANY($1::text[])
          ORDER BY tablename
        `,
        [requiredTables]
      );

      expect(result.rows.map((row) => row.tablename)).toEqual([...requiredTables].sort());
    });
  });

  it("creates approved CHECK constraints and indexes", async () => {
    await withTestClient(async (client) => {
      const constraints = await client.query<{ conname: string }>(
        `
          SELECT conname
          FROM pg_constraint
          WHERE conname = ANY($1::text[])
          ORDER BY conname
        `,
        [requiredCheckConstraints]
      );
      const indexes = await client.query<{ indexname: string }>(
        `
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ANY($1::text[])
          ORDER BY indexname
        `,
        [
          [
            "idx_sites_tags_gin",
            "idx_sites_features_gin",
            "idx_sites_status_active_deleted",
            "idx_categories_active_sort_order"
          ]
        ]
      );

      expect(constraints.rows.map((row) => row.conname)).toEqual([...requiredCheckConstraints].sort());
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_categories_active_sort_order",
        "idx_sites_features_gin",
        "idx_sites_status_active_deleted",
        "idx_sites_tags_gin"
      ]);
    });
  });

  it("enforces unique and check constraints", async () => {
    await withTestClient(async (client) => {
      const suffix = randomUUID();

      await client.query("BEGIN");

      try {
        await client.query(
          "INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now())",
          [`user-${suffix}@example.test`, "hash", "editor"]
        );
        await expect(
          client.query("INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now())", [
            `user-${suffix}@example.test`,
            "hash",
            "editor"
          ])
        ).rejects.toThrow();

        await client.query("ROLLBACK");
        await client.query("BEGIN");

        await expect(
          client.query("INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now())", [
            `Mixed-${suffix}@example.test`,
            "hash",
            "editor"
          ])
        ).rejects.toThrow();

        await client.query("ROLLBACK");
        await client.query("BEGIN");

        await expect(
          client.query("INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now())", [
            `role-${suffix}@example.test`,
            "hash",
            "owner"
          ])
        ).rejects.toThrow();
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });

  it("enforces catalog, session, cleanup, and audit guards", async () => {
    await withTestClient(async (client) => {
      const suffix = randomUUID();

      await expectRejectedTransaction(
        client,
        async () => {
          await client.query(
            "INSERT INTO categories (slug, title, updated_at) VALUES ($1, $2, now())",
            [`category-unique-${suffix}`, "Category"]
          );
        },
        async () => {
          await client.query(
            "INSERT INTO categories (slug, title, updated_at) VALUES ($1, $2, now())",
            [`category-unique-${suffix}`, "Category duplicate"]
          );
        }
      );

      await expectRejectedTransaction(
        client,
        async () => {
          const categoryId = await createCategory(client, `site-unique-category-${suffix}`);

          await client.query(
            `
              INSERT INTO sites (slug, title, category_id, short_description, updated_at)
              VALUES ($1, $2, $3, $4, now())
            `,
            [`site-unique-${suffix}`, "Site", categoryId, "Description"]
          );
        },
        async () => {
          const categoryId = await selectCategoryId(client, `site-unique-category-${suffix}`);

          await client.query(
            `
              INSERT INTO sites (slug, title, category_id, short_description, updated_at)
              VALUES ($1, $2, $3, $4, now())
            `,
            [`site-unique-${suffix}`, "Site duplicate", categoryId, "Description"]
          );
        }
      );

      await expectRejectedTransaction(
        client,
        async () => {
          const userId = await createUser(client, `token-unique-${suffix}@example.test`);

          await client.query(
            `
              INSERT INTO refresh_sessions (user_id, token_hash, family_id, expires_at, updated_at)
              VALUES ($1, $2, gen_random_uuid(), now() + interval '1 day', now())
            `,
            [userId, `refresh-token-${suffix}`]
          );
        },
        async () => {
          const userId = await selectUserId(client, `token-unique-${suffix}@example.test`);

          await client.query(
            `
              INSERT INTO refresh_sessions (user_id, token_hash, family_id, expires_at, updated_at)
              VALUES ($1, $2, gen_random_uuid(), now() + interval '1 day', now())
            `,
            [userId, `refresh-token-${suffix}`]
          );
        }
      );

      await expectInvalidSiteField(client, `negative-views-${suffix}`, "views", -1);
      await expectInvalidSiteField(client, `zero-price-${suffix}`, "price_amount_cents", 0);
      await expectInvalidSiteField(client, `zero-days-${suffix}`, "development_days", 0);
      await expectInvalidSiteField(client, `bad-status-${suffix}`, "status", "deleted");
      await expectInvalidSiteField(client, `bad-demo-mode-${suffix}`, "demo_mode", "iframe");

      await expectRejectedTransaction(
        client,
        async () => undefined,
        async () => {
          await client.query(
            `
              INSERT INTO storage_cleanup_jobs (storage_path, reason, status, attempts, updated_at)
              VALUES ($1, $2, $3, $4, now())
            `,
            [`catalog/${suffix}/image.png`, "test", "queued", 0]
          );
        }
      );

      await expectRejectedTransaction(
        client,
        async () => undefined,
        async () => {
          await client.query(
            `
              INSERT INTO storage_cleanup_jobs (storage_path, reason, status, attempts, updated_at)
              VALUES ($1, $2, $3, $4, now())
            `,
            [`catalog/${suffix}/image.png`, "test", "pending", -1]
          );
        }
      );

      await expectRejectedTransaction(
        client,
        async () => undefined,
        async () => {
          await client.query(
            `
              INSERT INTO audit_logs (action, entity_type, request_id)
              VALUES ($1, $2, $3)
            `,
            ["created", "unknown", `req_${suffix}`]
          );
        }
      );
    });
  });

  it("blocks category cascade deletes and preserves related sites", async () => {
    await withTestClient(async (client) => {
      const suffix = randomUUID();

      await client.query("BEGIN");

      try {
        const category = await client.query<{ id: string }>(
          "INSERT INTO categories (slug, title, updated_at) VALUES ($1, $2, now()) RETURNING id",
          [`category-${suffix}`, "Category"]
        );
        const categoryId = category.rows[0]?.id;

        if (categoryId === undefined) {
          throw new Error("Expected category id.");
        }

        await client.query(
          `
            INSERT INTO sites (slug, title, category_id, short_description, updated_at)
            VALUES ($1, $2, $3, $4, now())
          `,
          [`site-${suffix}`, "Site", categoryId, "Description"]
        );

        await expect(client.query("DELETE FROM categories WHERE id = $1", [categoryId])).rejects.toThrow();

        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });

  it("enforces B2 relation behavior", async () => {
    await withTestClient(async (client) => {
      const suffix = randomUUID();

      await client.query("BEGIN");

      try {
        const user = await client.query<{ id: string }>(
          "INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now()) RETURNING id",
          [`relations-${suffix}@example.test`, "hash", "editor"]
        );
        const userId = user.rows[0]?.id;

        if (userId === undefined) {
          throw new Error("Expected user id.");
        }

        const replacement = await client.query<{ id: string }>(
          `
            INSERT INTO refresh_sessions (user_id, token_hash, family_id, expires_at, updated_at)
            VALUES ($1, $2, gen_random_uuid(), now() + interval '1 day', now())
            RETURNING id
          `,
          [userId, `replacement-${suffix}`]
        );
        const replacementId = replacement.rows[0]?.id;

        await client.query(
          `
            INSERT INTO refresh_sessions (user_id, token_hash, family_id, replaced_by_session_id, expires_at, updated_at)
            VALUES ($1, $2, gen_random_uuid(), $3, now() + interval '1 day', now())
          `,
          [userId, `source-${suffix}`, replacementId]
        );
        await client.query(
          `
            INSERT INTO audit_logs (actor_user_id, action, entity_type, request_id)
            VALUES ($1, $2, $3, $4)
          `,
          [userId, "created", "user", `req_${suffix}`]
        );

        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        const sessions = await client.query<{ count: string }>(
          "SELECT count(*) FROM refresh_sessions WHERE user_id = $1",
          [userId]
        );
        const auditLogs = await client.query<{ actor_user_id: string | null }>(
          "SELECT actor_user_id FROM audit_logs WHERE request_id = $1",
          [`req_${suffix}`]
        );

        expect(sessions.rows[0]?.count).toBe("0");
        expect(auditLogs.rows[0]?.actor_user_id).toBeNull();
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });
});

describe("canonical catalog publish migration", () => {
  it("publishes exactly 15 eligible canonical draft rows and leaves the owner test clone untouched", async () => {
    const migrationSql = readFileSync(publishCanonicalMigrationPath, "utf8");

    await withTestClient(async (client) => {
      await client.query("BEGIN");

      try {
        const categoryId = await createCategory(client, `canonical-publish-${randomUUID()}`);

        await client.query("DELETE FROM sites WHERE slug = ANY($1::text[])", [
          [...canonicalSlugs, ownerCloneSlug]
        ]);
        for (const [index, slug] of canonicalSlugs.entries()) {
          await insertMigrationSite(client, {
            categoryId,
            index,
            publishedAt: null,
            slug,
            status: "draft",
            title: `Canonical ${slug}`,
            updatedAt: new Date(Date.UTC(2026, 6, 2, 9, index, 0))
          });
        }
        await insertMigrationSite(client, {
          categoryId,
          index: 99,
          publishedAt: new Date("2026-07-29T00:00:00.000Z"),
          slug: ownerCloneSlug,
          status: "published",
          title: "Owner clone",
          updatedAt: new Date("2026-07-29T01:02:03.000Z")
        });
        const beforeRows = await selectMigrationSiteRows(client, [...canonicalSlugs, ownerCloneSlug]);
        const beforeBySlug = new Map(beforeRows.map((row) => [row.slug, row]));

        await client.query(migrationSql);

        const afterRows = await selectMigrationSiteRows(client, [...canonicalSlugs, ownerCloneSlug]);
        const afterBySlug = new Map(afterRows.map((row) => [row.slug, row]));

        expect(afterRows).toHaveLength(16);
        for (const slug of canonicalSlugs) {
          const before = expectDefined(beforeBySlug.get(slug));
          const after = expectDefined(afterBySlug.get(slug));

          expect(after.status).toBe("published");
          expect(after.published_at).toBeInstanceOf(Date);
          expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
          expect(withoutCanonicalPromotionFields(after)).toEqual(withoutCanonicalPromotionFields(before));
        }
        expect(afterBySlug.get(ownerCloneSlug)).toEqual(beforeBySlug.get(ownerCloneSlug));
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });

  it("rejects partial canonical promotion counts instead of leaving a half-published catalog", async () => {
    const migrationSql = readFileSync(publishCanonicalMigrationPath, "utf8");

    await withTestClient(async (client) => {
      await client.query("BEGIN");

      try {
        const categoryId = await createCategory(client, `canonical-partial-${randomUUID()}`);

        await client.query("DELETE FROM sites WHERE slug = ANY($1::text[])", [canonicalSlugs]);
        await client.query(
          `
            INSERT INTO sites (slug, title, category_id, short_description, status, active, published_at, deleted_at, updated_at)
            VALUES ('mebel', 'Canonical mebel', $1, 'Canonical short', 'draft', true, NULL, NULL, now())
          `,
          [categoryId]
        );

        await expect(client.query(migrationSql)).rejects.toThrow(/Expected to publish either 0 or 15 canonical sites/);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
  });
});

async function expectRejectedTransaction(
  client: Client,
  setup: () => Promise<void>,
  action: () => Promise<unknown>
): Promise<void> {
  await client.query("BEGIN");

  try {
    await setup();
    await expect(action()).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

async function createCategory(client: Client, slug: string): Promise<string> {
  const category = await client.query<{ id: string }>(
    "INSERT INTO categories (slug, title, updated_at) VALUES ($1, $2, now()) RETURNING id",
    [slug, "Category"]
  );
  const categoryId = category.rows[0]?.id;

  if (categoryId === undefined) {
    throw new Error("Expected category id.");
  }

  return categoryId;
}

async function insertMigrationSite(client: Client, input: MigrationSiteInput): Promise<void> {
  await client.query(
    `
      INSERT INTO sites (
        slug,
        title,
        category_id,
        legacy_title,
        short_description,
        full_description,
        features,
        tags,
        demo_url,
        site_url,
        preview_image_url,
        gallery_images,
        preview_type,
        demo_mode,
        demo_local_url,
        external_demo_url,
        original_demo_url,
        price_amount_cents,
        price_label,
        development_days,
        delivery_label,
        status,
        active,
        featured,
        views,
        sort_order,
        published_at,
        deleted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::text[],
        $8::text[],
        $9,
        $10,
        $11,
        $12::jsonb,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22,
        true,
        $23,
        $24,
        $25,
        $26,
        NULL,
        $27,
        $28
      )
    `,
    [
      input.slug,
      input.title,
      input.categoryId,
      `${input.slug} legacy`,
      `${input.slug} short`,
      `${input.slug} full`,
      [`${input.slug}-feature`, "stable-feature"],
      [`${input.slug}-tag`, "stable-tag"],
      `https://demo.example.test/${input.slug}`,
      `https://site.example.test/${input.slug}`,
      `https://cdn.example.test/${input.slug}/preview.webp`,
      JSON.stringify([{ alt: `${input.slug} gallery`, sortOrder: input.index, url: `https://cdn.example.test/${input.slug}/gallery.webp` }]),
      "delivery",
      "external-iframe",
      `demos/${input.slug}/index.html`,
      `https://external.example.test/${input.slug}`,
      `https://original.example.test/${input.slug}`,
      10_000 + input.index,
      `Price ${input.index}`,
      2 + input.index,
      `Delivery ${input.index}`,
      input.status,
      input.index % 2 === 0,
      input.index,
      input.index,
      input.publishedAt,
      new Date(Date.UTC(2026, 6, 1, 8, input.index, 0)),
      input.updatedAt
    ]
  );
}

async function selectMigrationSiteRows(client: Client, slugs: string[]): Promise<MigrationSiteRow[]> {
  const result = await client.query<MigrationSiteRow>(
    `
      SELECT
        id,
        slug,
        title,
        category_id,
        legacy_title,
        short_description,
        full_description,
        features,
        tags,
        demo_url,
        site_url,
        preview_image_url,
        gallery_images,
        preview_type,
        demo_mode,
        demo_local_url,
        external_demo_url,
        original_demo_url,
        price_amount_cents,
        price_label,
        development_days,
        delivery_label,
        status,
        active,
        featured,
        views,
        sort_order,
        published_at,
        deleted_at,
        created_at,
        updated_at
      FROM sites
      WHERE slug = ANY($1::text[])
      ORDER BY slug
    `,
    [slugs]
  );

  return result.rows;
}

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value to be defined.");
  }

  return value;
}

function withoutCanonicalPromotionFields(row: MigrationSiteRow): Omit<MigrationSiteRow, "published_at" | "status"> {
  const { published_at: _publishedAt, status: _status, ...rest } = row;
  return rest;
}

async function selectCategoryId(client: Client, slug: string): Promise<string> {
  const category = await client.query<{ id: string }>("SELECT id FROM categories WHERE slug = $1", [slug]);
  const categoryId = category.rows[0]?.id;

  if (categoryId === undefined) {
    throw new Error("Expected category id.");
  }

  return categoryId;
}

async function createUser(client: Client, email: string): Promise<string> {
  const user = await client.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role, updated_at) VALUES ($1, $2, $3, now()) RETURNING id",
    [email, "hash", "editor"]
  );
  const userId = user.rows[0]?.id;

  if (userId === undefined) {
    throw new Error("Expected user id.");
  }

  return userId;
}

async function selectUserId(client: Client, email: string): Promise<string> {
  const user = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const userId = user.rows[0]?.id;

  if (userId === undefined) {
    throw new Error("Expected user id.");
  }

  return userId;
}

async function expectInvalidSiteField(
  client: Client,
  slug: string,
  column: "demo_mode" | "development_days" | "price_amount_cents" | "status" | "views",
  value: number | string
): Promise<void> {
  await expectRejectedTransaction(
    client,
    async () => undefined,
    async () => {
      const categoryId = await createCategory(client, `category-${slug}`);

      await client.query(
        `
          INSERT INTO sites (slug, title, category_id, short_description, ${column}, updated_at)
          VALUES ($1, $2, $3, $4, $5, now())
        `,
        [slug, "Site", categoryId, "Description", value]
      );
    }
  );
}
