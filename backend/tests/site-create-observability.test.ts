import { describe, expect, it, vi } from "vitest";
import type { AppLogger } from "../src/lib/logger.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import { createPrismaAdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import {
  SITE_CREATE_DRAFT_STAGES,
  type SiteCreateDraftFailedLogEntry
} from "../src/modules/admin/sites/site-create-observability.js";
import type {
  AdminSiteRecord,
  CreateAdminSiteInput
} from "../src/modules/admin/sites/site.types.js";

const context: AdminMutationContext = {
  actor: {
    email: "admin@example.com",
    id: "55555555-5555-4555-8555-555555555555",
    role: "admin",
    sessionId: "session-secret",
    tokenId: "token-secret"
  },
  now: new Date("2026-07-28T00:00:00.000Z"),
  requestId: "req_site_create_observability"
};

describe("site create draft observability", () => {
  it("exposes the approved site create draft stage map", () => {
    expect(SITE_CREATE_DRAFT_STAGES).toEqual([
      "IDEMPOTENCY_LOCK_STARTED",
      "IDEMPOTENCY_LOCK_COMPLETED",
      "REPLAY_LOOKUP_STARTED",
      "REPLAY_LOOKUP_COMPLETED",
      "CATEGORY_LOOKUP_STARTED",
      "CATEGORY_LOOKUP_COMPLETED",
      "SITE_INSERT_STARTED",
      "SITE_INSERT_COMPLETED",
      "AUDIT_INSERT_STARTED",
      "AUDIT_INSERT_COMPLETED",
      "TRANSACTION_COMMIT_PENDING",
      "REQUEST_COMPLETED"
    ]);
  });

  it("reports IDEMPOTENCY_LOCK_STARTED when the raw advisory lock fails before category lookup", async () => {
    const lockError = prismaLikeError("P2010", {
      code: "XX000",
      message:
        "Failed to deserialize column of type void while running SELECT pg_advisory_xact_lock with secret-title"
    });
    const { calls, events, repository } = createRepository({ queryRawError: lockError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(lockError);

    expect(calls.queryRaw).toHaveBeenCalledTimes(1);
    expect(calls.auditFindFirst).not.toHaveBeenCalled();
    expect(calls.categoryFindUnique).not.toHaveBeenCalled();
    expect(calls.siteCreate).not.toHaveBeenCalled();
    expect(calls.auditCreate).not.toHaveBeenCalled();

    const event = singleFailureEvent(events);

    expect(event).toMatchObject({
      databaseErrorCode: "XX000",
      databaseErrorMessageCategory: "RAW_RESULT_DECODING_FAILED",
      event: "site.create_draft.failed",
      prismaCode: "P2010",
      stage: "IDEMPOTENCY_LOCK_STARTED",
      transactionCallbackCompleted: false
    });
    expect(JSON.stringify(event)).not.toContain("pg_advisory_xact_lock");
    expect(JSON.stringify(event)).not.toContain("secret-title");
    expect(JSON.stringify(event)).not.toContain("Failed to deserialize");
  });

  it("rejects malformed advisory lock scalar results before replay, category, site, or audit writes", async () => {
    const { calls, events, repository } = createRepository({
      queryRawResult: [{ pg_advisory_xact_lock: "" }]
    });

    await expect(repository.createDraft(validInput(), context)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      statusCode: 500
    });

    expect(calls.queryRaw).toHaveBeenCalledTimes(1);
    expect(calls.auditFindFirst).not.toHaveBeenCalled();
    expect(calls.categoryFindUnique).not.toHaveBeenCalled();
    expect(calls.siteCreate).not.toHaveBeenCalled();
    expect(calls.auditCreate).not.toHaveBeenCalled();
    expect(singleFailureEvent(events)).toMatchObject({
      prismaCode: null,
      stage: "IDEMPOTENCY_LOCK_STARTED",
      transactionCallbackCompleted: false
    });
  });

  it("reports CATEGORY_LOOKUP_STARTED when category lookup fails", async () => {
    const categoryError = new Error("category unavailable");
    const { events, repository } = createRepository({ categoryError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(categoryError);

    expect(singleFailureEvent(events)).toMatchObject({
      event: "site.create_draft.failed",
      stage: "CATEGORY_LOOKUP_STARTED",
      transactionCallbackCompleted: false
    });
  });

  it("reports SITE_INSERT_STARTED when site insert fails", async () => {
    const siteCreateError = new Error("site insert unavailable");
    const { events, repository } = createRepository({ siteCreateError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(siteCreateError);

    expect(singleFailureEvent(events)).toMatchObject({
      stage: "SITE_INSERT_STARTED",
      transactionCallbackCompleted: false
    });
  });

  it("reports AUDIT_INSERT_STARTED when audit insert fails", async () => {
    const auditCreateError = new Error("audit unavailable");
    const { events, repository } = createRepository({ auditCreateError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(auditCreateError);

    expect(singleFailureEvent(events)).toMatchObject({
      stage: "AUDIT_INSERT_STARTED",
      transactionCallbackCompleted: false
    });
  });

  it("reports TRANSACTION_COMMIT_PENDING after the transaction callback completed", async () => {
    const commitError = new Error("commit unavailable");
    const { events, repository } = createRepository({ commitError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(commitError);

    expect(singleFailureEvent(events)).toMatchObject({
      stage: "TRANSACTION_COMMIT_PENDING",
      transactionCallbackCompleted: true
    });
  });

  it("preserves Prisma P2028 on failed create draft events", async () => {
    const siteCreateError = prismaLikeError("P2028");
    const { events, repository } = createRepository({ siteCreateError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(siteCreateError);

    expect(singleFailureEvent(events)).toMatchObject({
      errorClass: "PrismaClientKnownRequestError",
      prismaCode: "P2028"
    });
  });

  it("preserves Prisma P2024 on failed create draft events", async () => {
    const siteCreateError = prismaLikeError("P2024");
    const { events, repository } = createRepository({ siteCreateError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(siteCreateError);

    expect(singleFailureEvent(events)).toMatchObject({
      errorClass: "PrismaClientKnownRequestError",
      prismaCode: "P2024"
    });
  });

  it("normalizes non-Prisma errors to prismaCode null", async () => {
    const siteCreateError = new Error("plain failure");
    const { events, repository } = createRepository({ siteCreateError });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(siteCreateError);

    expect(singleFailureEvent(events)).toMatchObject({
      errorClass: "Error",
      prismaCode: null
    });
  });

  it("does not include payload, actor, raw error message, or stack data", async () => {
    const siteCreateError = Object.assign(
      new Error(
        "raw DB message with secret-site-slug, Secret Site Title, admin@example.com, https://secret-site.example.test, bearer-token-secret, INSERT INTO sites, and category id"
      ),
      {
        stack:
          "Error: stack includes refresh-token-secret and SQL SELECT * FROM sites WHERE slug = 'secret-site-slug'"
      }
    );
    const { events, repository } = createRepository({ siteCreateError });

    await expect(
      repository.createDraft(
        {
          ...validInput(),
          categoryId: "11111111-1111-4111-8111-111111111111",
          fullDescription: "Secret full description",
          shortDescription: "Secret short description",
          slug: "secret-site-slug",
          siteUrl: "https://secret-site.example.test",
          title: "Secret Site Title"
        },
        context
      )
    ).rejects.toBe(siteCreateError);

    const event = singleFailureEvent(events);
    const serialized = JSON.stringify(event);

    expect(event).not.toHaveProperty("input");
    expect(event).not.toHaveProperty("categoryId");
    expect(event).not.toHaveProperty("siteId");
    expect(event).not.toHaveProperty("slug");
    expect(event).not.toHaveProperty("title");
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("stack");
    expect(event).not.toHaveProperty("actor");
    expect(event).not.toHaveProperty("email");
    expect(serialized).not.toContain("secret-site-slug");
    expect(serialized).not.toContain("Secret Site Title");
    expect(serialized).not.toContain("Secret short description");
    expect(serialized).not.toContain("Secret full description");
    expect(serialized).not.toContain("https://secret-site.example.test");
    expect(serialized).not.toContain("INSERT INTO");
    expect(serialized).not.toContain("SELECT * FROM sites");
    expect(serialized).not.toContain("bearer-token-secret");
    expect(serialized).not.toContain("refresh-token-secret");
    expect(serialized).not.toContain("admin@example.com");
    expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("does not let diagnostics logger failures replace the original exception", async () => {
    const siteCreateError = new Error("site insert unavailable");
    const { repository } = createRepository({
      logger: {
        log() {
          throw new Error("logger unavailable");
        }
      },
      siteCreateError
    });

    await expect(repository.createDraft(validInput(), context)).rejects.toBe(siteCreateError);
  });

  it("does not emit failed events on successful create draft", async () => {
    const { events, repository } = createRepository();

    await expect(repository.createDraft(validInput(), context)).resolves.toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      slug: "site-create-observability"
    });

    expect(events).toEqual([]);
  });
});

function createRepository(overrides: {
  auditCreateError?: unknown;
  categoryError?: unknown;
  commitError?: unknown;
  logger?: AppLogger;
  queryRawError?: unknown;
  queryRawResult?: unknown[];
  siteCreateError?: unknown;
} = {}) {
  const events: SiteCreateDraftFailedLogEntry[] = [];
  const calls = {
    auditCreate: vi.fn(),
    auditFindFirst: vi.fn(),
    categoryFindUnique: vi.fn(),
    queryRaw: vi.fn(),
    siteCreate: vi.fn(),
    siteFindUnique: vi.fn()
  };
  const tx = {
    $queryRaw: calls.queryRaw.mockImplementation(async () => {
      if (overrides.queryRawError !== undefined) {
        throw overrides.queryRawError;
      }

      return overrides.queryRawResult ?? [{ acquired: 1 }];
    }),
    auditLog: {
      create: calls.auditCreate.mockImplementation(async () => {
        if (overrides.auditCreateError !== undefined) {
          throw overrides.auditCreateError;
        }

        return {};
      }),
      findFirst: calls.auditFindFirst.mockImplementation(async () => null)
    },
    category: {
      findUnique: calls.categoryFindUnique.mockImplementation(async () => {
        if (overrides.categoryError !== undefined) {
          throw overrides.categoryError;
        }

        return { active: true };
      })
    },
    site: {
      create: calls.siteCreate.mockImplementation(async () => {
        if (overrides.siteCreateError !== undefined) {
          throw overrides.siteCreateError;
        }

        return siteRecord();
      }),
      findUnique: calls.siteFindUnique.mockImplementation(async () => null)
    }
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await operation(tx);

      if (overrides.commitError !== undefined) {
        throw overrides.commitError;
      }

      return result;
    })
  };
  const logger = overrides.logger ?? {
    log(entry) {
      events.push(entry as SiteCreateDraftFailedLogEntry);
    }
  };
  const repository = createPrismaAdminSiteRepository({
    diagnostics: {
      environment: "test",
      logger,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      service: "web00-backend"
    },
    prisma: prisma as never
  });

  return { calls, events, repository };
}

function singleFailureEvent(events: SiteCreateDraftFailedLogEntry[]): SiteCreateDraftFailedLogEntry {
  expect(events).toHaveLength(1);

  return events[0] as SiteCreateDraftFailedLogEntry;
}

function prismaLikeError(
  code: string,
  meta?: Record<string, unknown>
): Error & { code: string; meta?: Record<string, unknown> } {
  return Object.assign(new Error(`raw Prisma message for ${code}`), {
    code,
    ...(meta === undefined ? {} : { meta }),
    name: "PrismaClientKnownRequestError"
  });
}

function validInput(): CreateAdminSiteInput {
  return {
    categoryId: "11111111-1111-4111-8111-111111111111",
    features: ["Feature"],
    fullDescription: "Full description",
    priceAmountCents: 123_45,
    priceLabel: "$123.45",
    shortDescription: "Short description",
    slug: "site-create-observability",
    tags: ["tag"],
    title: "Site Create Observability"
  };
}

function siteRecord(): AdminSiteRecord {
  return {
    active: true,
    category: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "category",
      title: "Category"
    },
    categoryId: "11111111-1111-4111-8111-111111111111",
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    deletedAt: null,
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: null,
    featured: false,
    features: ["Feature"],
    fullDescription: "Full description",
    galleryImages: [],
    id: "22222222-2222-4222-8222-222222222222",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: null,
    previewType: null,
    priceAmountCents: 123_45,
    priceLabel: "$123.45",
    publishedAt: null,
    shortDescription: "Short description",
    siteUrl: null,
    slug: "site-create-observability",
    sortOrder: 0,
    status: "draft",
    tags: ["tag"],
    title: "Site Create Observability",
    updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    views: 0
  };
}
