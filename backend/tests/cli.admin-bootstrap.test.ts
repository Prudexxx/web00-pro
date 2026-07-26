import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createCliUserService } from "../src/cli/cli-user.service.js";
import {
  MAX_SERIALIZABLE_ATTEMPTS,
  runSerializableWithRetry
} from "../src/cli/cli-user.repository.js";
import { CliError } from "../src/cli/cli-errors.js";
import { runAdminBootstrapCommand } from "../src/cli/admin-bootstrap.command.js";

const safeAdmin = {
  active: true,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  email: "admin@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  lastLoginAt: null,
  role: "admin" as const,
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

describe("CLI bootstrap service", () => {
  it("creates the production repository from runtime database env only", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "cli", "admin-bootstrap.command.ts"),
      "utf8"
    );

    expect(source).toContain("parseRuntimeDatabaseEnv");
    expect(source).not.toContain("parseDatabaseEnv");
  });

  it("normalizes email and passes only passwordHash into the repository", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn().mockResolvedValue(safeAdmin),
      createUser: vi.fn(),
      setPassword: vi.fn()
    };
    const service = createCliUserService({ repository });

    const output = await service.bootstrapFirstAdmin({
      email: " Admin@Example.COM ",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:bootstrap"
    });

    expect(repository.bootstrapFirstAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:bootstrap"
    });
    expect(JSON.stringify(repository.bootstrapFirstAdmin.mock.calls)).not.toContain("password123");
    expect(output).toMatchObject({
      code: "USER_BOOTSTRAPPED",
      user: {
        active: true,
        email: "admin@example.com",
        role: "admin"
      }
    });
    expect(JSON.stringify(output)).not.toContain("argon2-hash");
  });

  it("exits safely before repository mutation when terminal is non-interactive", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn(),
      setPassword: vi.fn()
    };
    const terminal = {
      close: vi.fn(async () => undefined),
      confirmExact: vi.fn(),
      promptSecret: vi.fn(),
      promptVisible: vi.fn().mockRejectedValue(new CliError("INTERACTIVE_TTY_REQUIRED")),
      writeSafe: vi.fn()
    };

    await expect(
      runAdminBootstrapCommand({
        clock: () => new Date("2026-07-25T00:00:00.000Z"),
        hasher: fakeHasher(),
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
        repository,
        terminal
      })
    ).resolves.toBe(1);
    expect(repository.bootstrapFirstAdmin).not.toHaveBeenCalled();
    expect(terminal.writeSafe).toHaveBeenCalledWith(
      expect.stringContaining("INTERACTIVE_TTY_REQUIRED")
    );
  });
});

describe("runSerializableWithRetry", () => {
  it("retries P2034 once and opens a fresh serializable transaction per attempt", async () => {
    const transactions: unknown[] = [];
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: unknown) => Promise<string>, options) => {
        expect(options).toMatchObject({ isolationLevel: "Serializable" });
        const tx = {};
        transactions.push(tx);

        if (transactions.length === 1) {
          throw Object.assign(new Error("write conflict"), { code: "P2034" });
        }

        return operation(tx);
      })
    };

    await expect(
      runSerializableWithRetry(prisma as never, async () => "ok")
    ).resolves.toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(new Set(transactions).size).toBe(2);
  });

  it("retries Prisma adapter PostgreSQL 40001 write conflicts", async () => {
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce({
          cause: {
            kind: "TransactionWriteConflict",
            originalCode: "40001"
          },
          name: "DriverAdapterError"
        })
        .mockImplementationOnce(async (operation: (tx: unknown) => Promise<string>) =>
          operation({})
        )
    };

    await expect(
      runSerializableWithRetry(prisma as never, async () => "ok")
    ).resolves.toBe("ok");
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-40001 Prisma adapter errors", async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue({
        cause: {
          kind: "UniqueConstraintViolation",
          originalCode: "23505"
        },
        name: "DriverAdapterError"
      })
    };

    await expect(
      runSerializableWithRetry(prisma as never, async () => "unused")
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ originalCode: "23505" })
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not retry AppError or non-P2034 failures", async () => {
    const appError = new AppError({
      code: "USER_EMAIL_CONFLICT",
      message: "Email is already in use.",
      statusCode: 409
    });
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(appError)
    };

    await expect(
      runSerializableWithRetry(prisma as never, async () => "unused")
    ).rejects.toBe(appError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-P2034 Prisma failures", async () => {
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("unique conflict"), { code: "P2002" }))
    };

    await expect(
      runSerializableWithRetry(prisma as never, async () => "unused")
    ).rejects.toMatchObject({ code: "P2002" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("stops after exactly five P2034 attempts with CONCURRENT_MODIFICATION", async () => {
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }))
    };

    await expect(runSerializableWithRetry(prisma as never, async () => "unused")).rejects.toMatchObject({
      code: "CONCURRENT_MODIFICATION",
      statusCode: 409
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(MAX_SERIALIZABLE_ATTEMPTS);
  });
});

function fakeHasher() {
  return {
    hash: vi.fn(async () => "argon2-hash"),
    verify: vi.fn(),
    verifyDummy: vi.fn()
  };
}
