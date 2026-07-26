import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestDatabaseUrl, parseTestDatabaseEnv } from "../../src/config/database-env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { runAdminBootstrapCommand } from "../../src/cli/admin-bootstrap.command.js";
import { createPrismaCliUserRepository } from "../../src/cli/cli-user.repository.js";
import { createCliUserService } from "../../src/cli/cli-user.service.js";
import { runUserCreateCommand } from "../../src/cli/user-create.command.js";
import { runUserSetPasswordCommand } from "../../src/cli/user-set-password.command.js";
import type { InteractiveTerminal } from "../../src/cli/cli.types.js";
import {
  createConcurrencyBarrier,
  createUserCountGuardedPrismaClient,
  type SerializableAttemptEvent,
  type UserCountGuardEvent
} from "../helpers/concurrency-barrier.js";

const fixturePrefix = `b6-cli-${Date.now()}-`;
let prisma: PrismaClient;

beforeAll(() => {
  const databaseEnv = parseTestDatabaseEnv(process.env);

  assertTestDatabaseUrl(databaseEnv);
  prisma = createPrismaClient({
    databaseUrl: databaseEnv.TEST_DATABASE_URL
  });
});

beforeEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe("CLI user commands integration", () => {
  it("two concurrent first-admin bootstrap operations create exactly one admin and one audit", async () => {
    await expect(prisma.user.count({ where: { role: "admin" } })).resolves.toBe(0);

    const databaseEnv = parseTestDatabaseEnv(process.env);
    const clientA = createPrismaClient({
      databaseUrl: databaseEnv.TEST_DATABASE_URL
    });
    const clientB = createPrismaClient({
      databaseUrl: databaseEnv.TEST_DATABASE_URL
    });
    const barrier = createConcurrencyBarrier(2, {
      label: "first-admin-bootstrap"
    });
    const attempts: SerializableAttemptEvent[] = [];
    const guardReads: UserCountGuardEvent[] = [];
    const emailA = `${fixturePrefix}bootstrap-race-a@example.com`;
    const emailB = `${fixturePrefix}bootstrap-race-b@example.com`;
    const requestIdA = "cli:bootstrap-race-a";
    const requestIdB = "cli:bootstrap-race-b";

    try {
      const serviceA = createCliUserService({
        repository: createPrismaCliUserRepository({
          prisma: createUserCountGuardedPrismaClient({
            barrier,
            onAttempt: (event) => attempts.push(event),
            onGuardRead: (event) => guardReads.push(event),
            participant: "bootstrap-a",
            prisma: clientA,
            shouldPauseAfterUserCount: ({ count, where }) =>
              count === 0 && isBootstrapAdminGuard(where)
          })
        })
      });
      const serviceB = createCliUserService({
        repository: createPrismaCliUserRepository({
          prisma: createUserCountGuardedPrismaClient({
            barrier,
            onAttempt: (event) => attempts.push(event),
            onGuardRead: (event) => guardReads.push(event),
            participant: "bootstrap-b",
            prisma: clientB,
            shouldPauseAfterUserCount: ({ count, where }) =>
              count === 0 && isBootstrapAdminGuard(where)
          })
        })
      });

      const results = await Promise.allSettled([
        serviceA.bootstrapFirstAdmin({
          email: emailA,
          now: clock(),
          passwordHash: "hash:bootstrap-a",
          requestId: requestIdA
        }),
        serviceB.bootstrapFirstAdmin({
          email: emailB,
          now: clock(),
          passwordHash: "hash:bootstrap-b",
          requestId: requestIdB
        })
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );

      expect(barrier.released).toBe(true);
      expect(new Set(barrier.arrivedParticipants)).toEqual(
        new Set(["bootstrap-a", "bootstrap-b"])
      );
      expect(guardReads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ count: 0, participant: "bootstrap-a" }),
          expect.objectContaining({ count: 0, participant: "bootstrap-b" })
        ])
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toMatchObject({
        code: "BOOTSTRAP_ALREADY_COMPLETED"
      });
      expect(
        attempts.every(
          (event) => event.isolationLevel === Prisma.TransactionIsolationLevel.Serializable
        )
      ).toBe(true);
      expect(attempts.length).toBeGreaterThan(2);
      expect(countAttempts(attempts, "bootstrap-a")).toBeLessThanOrEqual(5);
      expect(countAttempts(attempts, "bootstrap-b")).toBeLessThanOrEqual(5);

      const users = await prisma.user.findMany({
        orderBy: { email: "asc" },
        select: { email: true, id: true, role: true },
        where: { email: { in: [emailA, emailB] } }
      });
      const audits = await prisma.auditLog.findMany({
        orderBy: { requestId: "asc" },
        select: {
          action: true,
          actorUserId: true,
          afterJson: true,
          beforeJson: true,
          entityId: true,
          requestId: true
        },
        where: {
          action: "user.bootstrap_admin",
          requestId: { in: [requestIdA, requestIdB] }
        }
      });

      expect(users).toHaveLength(1);
      const user = users[0]!;
      expect(user).toMatchObject({ role: "admin" });
      expect(audits).toHaveLength(1);
      const audit = audits[0]!;
      expect(audit).toMatchObject({
        action: "user.bootstrap_admin",
        actorUserId: null,
        beforeJson: null,
        entityId: user.id
      });
      expect(audit.afterJson).toMatchObject({
        email: user.email,
        id: user.id,
        role: "admin",
        source: "cli"
      });
      await expect(
        prisma.user.count({
          where: {
            email: { startsWith: `${fixturePrefix}bootstrap-race-` },
            role: "admin"
          }
        })
      ).resolves.toBe(1);
      expect(audits.every((entry) => entry.entityId === user.id)).toBe(true);
    } finally {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  it("bootstraps exactly one first admin and writes safe audit", async () => {
    const repository = createPrismaCliUserRepository({ prisma });
    const terminal = fakeTerminal({
      confirmations: [true],
      secrets: ["a".repeat(15), "a".repeat(15)],
      visible: [`${fixturePrefix}bootstrap@example.com`]
    });

    await expect(
      runAdminBootstrapCommand({
        clock,
        hasher: fakeHasher(),
        randomUUID: () => "bootstrap-request",
        repository,
        terminal
      })
    ).resolves.toBe(0);

    await expect(
      prisma.user.count({
        where: {
          email: `${fixturePrefix}bootstrap@example.com`,
          role: "admin"
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: "user.bootstrap_admin",
          actorUserId: null,
          requestId: "cli:bootstrap-request"
        }
      })
    ).resolves.toBe(1);

    const repeat = fakeTerminal({
      confirmations: [true],
      secrets: ["a".repeat(15), "a".repeat(15)],
      visible: [`${fixturePrefix}repeat@example.com`]
    });

    await expect(
      runAdminBootstrapCommand({
        clock,
        hasher: fakeHasher(),
        randomUUID: () => "bootstrap-repeat",
        repository,
        terminal: repeat
      })
    ).resolves.toBe(1);
    expect(JSON.stringify(repeat.output())).toContain("BOOTSTRAP_ALREADY_COMPLETED");
  });

  it("creates subsequent editor users without sessions or automatic login", async () => {
    const repository = createPrismaCliUserRepository({ prisma });
    await createUser("existing-admin", "admin", true);
    const terminal = fakeTerminal({
      confirmations: [true],
      secrets: ["a".repeat(15), "a".repeat(15)],
      visible: [`${fixturePrefix}new-editor@example.com`, ""]
    });

    await expect(
      runUserCreateCommand({
        clock,
        hasher: fakeHasher(),
        randomUUID: () => "create-editor",
        repository,
        terminal
      })
    ).resolves.toBe(0);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `${fixturePrefix}new-editor@example.com` }
    });

    expect(user.role).toBe("editor");
    expect(user.active).toBe(true);
    expect(user.lastLoginAt).toBeNull();
    await expect(prisma.refreshSession.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("sets disabled user password without enabling and revokes active sessions", async () => {
    const repository = createPrismaCliUserRepository({ prisma });
    const user = await createUser("disabled", "editor", false);
    const lastLoginAt = new Date("2026-07-20T00:00:00.000Z");

    await prisma.user.update({
      data: { lastLoginAt },
      where: { id: user.id }
    });
    await prisma.refreshSession.create({
      data: {
        expiresAt: new Date("2026-08-25T00:00:00.000Z"),
        familyId: randomUUID(),
        id: randomUUID(),
        tokenHash: randomUUID().replaceAll("-", ""),
        userId: user.id
      }
    });

    const terminal = fakeTerminal({
      confirmations: [true],
      secrets: ["b".repeat(15), "b".repeat(15)],
      visible: [user.email]
    });

    await expect(
      runUserSetPasswordCommand({
        clock,
        hasher: fakeHasher(),
        randomUUID: () => "set-password",
        repository,
        terminal
      })
    ).resolves.toBe(0);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(updated.active).toBe(false);
    expect(updated.lastLoginAt?.toISOString()).toBe(lastLoginAt.toISOString());
    await expect(
      prisma.refreshSession.count({ where: { userId: user.id, revokedAt: null } })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { action: "user.password_set_cli", requestId: "cli:set-password" }
      })
    ).resolves.toBe(1);
  });
});

function fakeTerminal(input: {
  confirmations: boolean[];
  secrets: string[];
  visible: string[];
}): InteractiveTerminal & { output: () => string[] } {
  const output: string[] = [];

  return {
    close: vi.fn(async () => undefined),
    confirmExact: vi.fn(async () => input.confirmations.shift() ?? false),
    output: () => output,
    promptSecret: vi.fn(async () => input.secrets.shift() ?? ""),
    promptVisible: vi.fn(async () => input.visible.shift() ?? ""),
    writeSafe: vi.fn((message: string) => {
      output.push(message);
    })
  };
}

function fakeHasher() {
  return {
    hash: vi.fn(async (password: string) => `hash:${password}`),
    verify: vi.fn(async (hash: string, password: string) => hash === `hash:${password}`),
    verifyDummy: vi.fn(async () => undefined)
  };
}

function clock(): Date {
  return new Date("2026-07-25T00:00:00.000Z");
}

async function createUser(label: string, role: "admin" | "editor", active: boolean) {
  return prisma.user.create({
    data: {
      active,
      email: `${fixturePrefix}${label}@example.com`,
      passwordHash: "hash:not-used",
      role
    }
  });
}

async function cleanupFixtures(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { email: { startsWith: fixturePrefix } }
  });
  const userIds = users.map((user) => user.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        { requestId: { startsWith: "cli:bootstrap" } },
        { requestId: { startsWith: "cli:create" } },
        { requestId: { startsWith: "cli:set-password" } }
      ]
    }
  });
  await prisma.refreshSession.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}

function isBootstrapAdminGuard(where: unknown): boolean {
  return (
    typeof where === "object" &&
    where !== null &&
    "role" in where &&
    (where as { role?: unknown }).role === "admin"
  );
}

function countAttempts(events: SerializableAttemptEvent[], participant: string): number {
  return events.filter((event) => event.participant === participant).length;
}
