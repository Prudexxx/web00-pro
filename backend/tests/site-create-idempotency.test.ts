import { describe, expect, it, vi } from "vitest";

import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import { createPrismaAdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import type {
  AdminSiteRecord,
  CreateAdminSiteInput
} from "../src/modules/admin/sites/site.types.js";

const context: AdminMutationContext = {
  actor: {
    email: "admin@example.test",
    id: "55555555-5555-4555-8555-555555555555",
    role: "admin",
    sessionId: "session-secret",
    tokenId: "token-secret"
  },
  now: new Date("2026-07-30T00:00:00.000Z"),
  requestId: "req_create_same_operation"
};

describe("admin site create durable idempotency", () => {
  it("replays the same actor/requestId/payload without creating a second site or audit", async () => {
    const { calls, repository, state } = createStatefulRepository();

    const first = await repository.createDraft(validInput(), context);
    const second = await repository.createDraft(validInput(), context);

    expect(second).toEqual(first);
    expect(calls.siteCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditFindFirst).toHaveBeenCalledTimes(2);
    expect(calls.queryRaw).toHaveBeenCalledTimes(2);
    expect(calls.categoryFindUnique).toHaveBeenCalledTimes(1);
    expect(state.audits[0]?.afterJson).toMatchObject({
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(state.audits[0]?.afterJson)).not.toContain("https://secret.example.test");
    expect(JSON.stringify(state.audits[0]?.afterJson)).not.toContain("session-secret");
    expect(JSON.stringify(state.audits[0]?.afterJson)).not.toContain("token-secret");
  });

  it("rejects the same requestId with a different normalized payload", async () => {
    const { calls, repository } = createStatefulRepository();

    await repository.createDraft(validInput(), context);
    await expect(
      repository.createDraft({
        ...validInput(),
        title: "Different payload"
      }, context)
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Операция сохранения уже использована с другими данными.",
      statusCode: 409
    });

    expect(calls.siteCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct requestId duplicate slug failures as SLUG_CONFLICT", async () => {
    const { repository } = createStatefulRepository();

    await repository.createDraft(validInput(), context);
    await expect(
      repository.createDraft(validInput(), {
        ...context,
        requestId: "req_create_distinct_duplicate_slug"
      })
    ).rejects.toMatchObject({
      code: "SLUG_CONFLICT",
      statusCode: 409
    });
  });

  it("returns a controlled 409 if a replay audit exists but the site is missing", async () => {
    const { repository, state } = createStatefulRepository();

    await repository.createDraft(validInput(), context);
    state.sites.clear();

    await expect(repository.createDraft(validInput(), context)).rejects.toMatchObject({
      code: "IDEMPOTENCY_REPLAY_UNAVAILABLE",
      statusCode: 409
    });
  });

  it("does not poison retry after a rolled-back create failure", async () => {
    const { calls, repository } = createStatefulRepository({
      failFirstSiteCreate: true
    });

    await expect(repository.createDraft(validInput(), context)).rejects.toThrow("rolled back insert");
    await expect(repository.createDraft(validInput(), context)).resolves.toMatchObject({
      slug: "site-create-idempotency"
    });

    expect(calls.siteCreate).toHaveBeenCalledTimes(2);
    expect(calls.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent same-operation create calls through the advisory-lock contract", async () => {
    const { calls, gates, repository } = createLockedRepository();

    const first = repository.createDraft(validInput(), context);
    await waitForPredicate(() => calls.siteCreate.mock.calls.length === 1);

    const second = repository.createDraft(validInput(), context);
    await gates.secondLockEntered.promise;
    await flushPromises();

    expect(calls.auditFindFirst).toHaveBeenCalledTimes(1);
    expect(calls.siteCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditCreate).not.toHaveBeenCalled();

    gates.firstCreateCanComplete.resolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(secondResult).toEqual(firstResult);
    expect(calls.queryRaw).toHaveBeenCalledTimes(2);
    expect(calls.auditFindFirst).toHaveBeenCalledTimes(2);
    expect(calls.siteCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditCreate).toHaveBeenCalledTimes(1);
    expect(calls.siteFindUnique).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent reused-key create calls and rejects the second different payload", async () => {
    const { calls, gates, repository } = createLockedRepository();

    const first = repository.createDraft(validInput(), context);
    await waitForPredicate(() => calls.siteCreate.mock.calls.length === 1);

    const second = repository.createDraft({
      ...validInput(),
      title: "Different concurrent payload"
    }, context);
    await gates.secondLockEntered.promise;
    await flushPromises();

    expect(calls.auditFindFirst).toHaveBeenCalledTimes(1);
    expect(calls.siteCreate).toHaveBeenCalledTimes(1);

    gates.firstCreateCanComplete.resolve();

    await expect(first).resolves.toMatchObject({
      slug: "site-create-idempotency"
    });
    await expect(second).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });

    expect(calls.auditFindFirst).toHaveBeenCalledTimes(2);
    expect(calls.siteCreate).toHaveBeenCalledTimes(1);
    expect(calls.auditCreate).toHaveBeenCalledTimes(1);
  });
});

function createStatefulRepository(options: { failFirstSiteCreate?: boolean } = {}) {
  const state = {
    audits: [] as Array<Record<string, unknown>>,
    nextSiteCreateFails: options.failFirstSiteCreate === true,
    sites: new Map<string, AdminSiteRecord>()
  };
  const calls = {
    auditCreate: vi.fn(),
    auditFindFirst: vi.fn(),
    categoryFindUnique: vi.fn(),
    queryRaw: vi.fn(),
    siteCreate: vi.fn(),
    siteFindUnique: vi.fn()
  };
  const tx = {
    $queryRaw: calls.queryRaw.mockImplementation(async () => [{ pg_advisory_xact_lock: "" }]),
    auditLog: {
      create: calls.auditCreate.mockImplementation(async ({ data }) => {
        state.audits.push({ ...data });
        return data;
      }),
      findFirst: calls.auditFindFirst.mockImplementation(async ({ where }) => (
        state.audits.find((audit) => (
          audit.actorUserId === where.actorUserId &&
          audit.requestId === where.requestId &&
          audit.action === where.action &&
          audit.entityType === where.entityType
        )) ?? null
      ))
    },
    category: {
      findUnique: calls.categoryFindUnique.mockResolvedValue({ active: true })
    },
    site: {
      create: calls.siteCreate.mockImplementation(async ({ data }) => {
        if (state.nextSiteCreateFails) {
          state.nextSiteCreateFails = false;
          throw new Error("rolled back insert");
        }
        if ([...state.sites.values()].some((site) => site.slug === data.slug)) {
          throw Object.assign(new Error("Unique constraint failed on slug"), {
            code: "P2002",
            name: "PrismaClientKnownRequestError"
          });
        }

        const site = siteRecord({
          ...data,
          id: `22222222-2222-4222-8222-${String(state.sites.size + 1).padStart(12, "0")}`
        });
        state.sites.set(site.id, site);
        return site;
      }),
      findUnique: calls.siteFindUnique.mockImplementation(async ({ where }) => (
        state.sites.get(where.id) ?? null
      ))
    }
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx))
  };

  return {
    calls,
    repository: createPrismaAdminSiteRepository({ prisma: prisma as never }),
    state
  };
}

function createLockedRepository() {
  const state = {
    audits: [] as Array<Record<string, unknown>>,
    sites: new Map<string, AdminSiteRecord>()
  };
  const calls = {
    auditCreate: vi.fn(),
    auditFindFirst: vi.fn(),
    categoryFindUnique: vi.fn(),
    queryRaw: vi.fn(),
    siteCreate: vi.fn(),
    siteFindUnique: vi.fn()
  };
  const gates = {
    firstCreateCanComplete: createDeferred<void>(),
    secondLockEntered: createDeferred<void>()
  };
  let lockHeld = false;
  const lockWaiters: Array<() => void> = [];
  const releaseLock = (): void => {
    lockHeld = false;
    while (lockWaiters.length > 0) {
      lockWaiters.shift()?.();
    }
  };
  const acquireLock = async (): Promise<unknown[]> => {
    if (!lockHeld) {
      lockHeld = true;
      return [{ pg_advisory_xact_lock: "" }];
    }

    gates.secondLockEntered.resolve();
    await new Promise<void>((resolve) => {
      lockWaiters.push(resolve);
    });
    lockHeld = true;

    return [{ pg_advisory_xact_lock: "" }];
  };
  const tx = {
    $queryRaw: calls.queryRaw.mockImplementation(acquireLock),
    auditLog: {
      create: calls.auditCreate.mockImplementation(async ({ data }) => {
        state.audits.push({ ...data });
        releaseLock();
        return data;
      }),
      findFirst: calls.auditFindFirst.mockImplementation(async ({ where }) => (
        state.audits.find((audit) => (
          audit.actorUserId === where.actorUserId &&
          audit.requestId === where.requestId &&
          audit.action === where.action &&
          audit.entityType === where.entityType
        )) ?? null
      ))
    },
    category: {
      findUnique: calls.categoryFindUnique.mockResolvedValue({ active: true })
    },
    site: {
      create: calls.siteCreate.mockImplementation(async ({ data }) => {
        if (calls.siteCreate.mock.calls.length === 1) {
          await gates.firstCreateCanComplete.promise;
        }

        const site = siteRecord({
          ...data,
          id: `33333333-3333-4333-8333-${String(state.sites.size + 1).padStart(12, "0")}`
        });
        state.sites.set(site.id, site);
        return site;
      }),
      findUnique: calls.siteFindUnique.mockImplementation(async ({ where }) => (
        state.sites.get(where.id) ?? null
      ))
    }
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx))
  };

  return {
    calls,
    gates,
    repository: createPrismaAdminSiteRepository({ prisma: prisma as never }),
    state
  };
}

function validInput(): CreateAdminSiteInput {
  return {
    categoryId: "11111111-1111-4111-8111-111111111111",
    demoMode: "external-iframe",
    externalDemoUrl: "https://secret.example.test/demo",
    features: ["A", "B"],
    fullDescription: "Full description",
    priceAmountCents: 123_45,
    priceLabel: "12345 ₽",
    shortDescription: "Short description",
    siteUrl: "https://secret.example.test",
    slug: "site-create-idempotency",
    tags: ["tag"],
    title: "Site Create Idempotency"
  };
}

function siteRecord(overrides: Partial<AdminSiteRecord> & Record<string, unknown> = {}): AdminSiteRecord {
  return {
    active: overrides.active === false ? false : true,
    category: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "category",
      title: "Category"
    },
    categoryId: String(overrides.categoryId ?? "11111111-1111-4111-8111-111111111111"),
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    deletedAt: null,
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: typeof overrides.demoMode === "string" ? overrides.demoMode : null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: typeof overrides.externalDemoUrl === "string" ? overrides.externalDemoUrl : null,
    featured: false,
    features: Array.isArray(overrides.features) ? overrides.features as string[] : [],
    fullDescription: typeof overrides.fullDescription === "string" ? overrides.fullDescription : null,
    galleryImages: [],
    id: String(overrides.id ?? "22222222-2222-4222-8222-222222222222"),
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: null,
    previewType: null,
    priceAmountCents: typeof overrides.priceAmountCents === "number" ? overrides.priceAmountCents : null,
    priceLabel: typeof overrides.priceLabel === "string" ? overrides.priceLabel : null,
    publishedAt: null,
    shortDescription: String(overrides.shortDescription ?? "Short description"),
    siteUrl: typeof overrides.siteUrl === "string" ? overrides.siteUrl : null,
    slug: String(overrides.slug ?? "site-create-idempotency"),
    sortOrder: 0,
    status: "draft",
    tags: Array.isArray(overrides.tags) ? overrides.tags as string[] : [],
    title: String(overrides.title ?? "Site Create Idempotency"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    views: 0
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForPredicate(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flushPromises();
  }

  throw new Error("Timed out waiting for repository concurrency test.");
}
