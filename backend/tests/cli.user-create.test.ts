import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCliUserService } from "../src/cli/cli-user.service.js";
import { runUserCreateCommand } from "../src/cli/user-create.command.js";

const createdUser = {
  active: true,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  email: "editor@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  lastLoginAt: null,
  role: "editor" as const,
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

describe("CLI user create service", () => {
  it("creates the production repository from runtime database env only", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "cli", "user-create.command.ts"),
      "utf8"
    );

    expect(source).toContain("parseRuntimeDatabaseEnv");
    expect(source).not.toContain("parseDatabaseEnv");
  });

  it("defaults to editor and writes safe output without sessions or login", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn().mockResolvedValue(createdUser),
      setPassword: vi.fn()
    };
    const service = createCliUserService({ repository });

    const output = await service.createUser({
      email: " Editor@Example.COM ",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:create"
    });

    expect(repository.createUser).toHaveBeenCalledWith({
      email: "editor@example.com",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:create",
      role: "editor"
    });
    expect(output).toMatchObject({
      code: "USER_CREATED",
      user: {
        active: true,
        email: "editor@example.com",
        role: "editor"
      }
    });
    expect(JSON.stringify(output)).not.toContain("argon2-hash");
    expect(JSON.stringify(output)).not.toContain("refresh");
  });

  it("passes explicit admin role only when requested", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn().mockResolvedValue({
        ...createdUser,
        email: "admin2@example.com",
        role: "admin"
      }),
      setPassword: vi.fn()
    };
    const service = createCliUserService({ repository });

    await service.createUser({
      email: "admin2@example.com",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:create_admin",
      role: "admin"
    });

    expect(repository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" })
    );
  });

  it("requires exact CREATE ADMIN confirmation before creating an admin", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn(),
      setPassword: vi.fn()
    };
    const terminal = {
      close: vi.fn(async () => undefined),
      confirmExact: vi.fn().mockResolvedValue(false),
      promptSecret: vi.fn().mockResolvedValue("a".repeat(15)),
      promptVisible: vi
        .fn()
        .mockResolvedValueOnce("admin2@example.com")
        .mockResolvedValueOnce("admin"),
      writeSafe: vi.fn()
    };

    await expect(
      runUserCreateCommand({
        clock: () => new Date("2026-07-25T00:00:00.000Z"),
        hasher: fakeHasher(),
        randomUUID: () => "cli-request-id",
        repository,
        terminal
      })
    ).resolves.toBe(1);
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(terminal.confirmExact).toHaveBeenCalledWith(
      "Type CREATE ADMIN to continue: ",
      "CREATE ADMIN"
    );
  });
});

function fakeHasher() {
  return {
    hash: vi.fn(async () => "argon2-hash"),
    verify: vi.fn(),
    verifyDummy: vi.fn()
  };
}
