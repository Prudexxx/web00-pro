import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCliUserService } from "../src/cli/cli-user.service.js";
import { runUserSetPasswordCommand } from "../src/cli/user-set-password.command.js";

describe("CLI user password-set service", () => {
  it("creates the production repository from runtime database env only", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "cli", "user-set-password.command.ts"),
      "utf8"
    );

    expect(source).toContain("parseRuntimeDatabaseEnv");
    expect(source).not.toContain("parseDatabaseEnv");
  });

  it("passes only passwordHash and returns a safe sessionsRevoked count", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn(),
      setPassword: vi.fn().mockResolvedValue({
        sessionsRevoked: 3,
        user: {
          active: false,
          createdAt: new Date("2026-07-25T00:00:00.000Z"),
          email: "disabled@example.com",
          id: "33333333-3333-4333-8333-333333333333",
          lastLoginAt: new Date("2026-07-20T00:00:00.000Z"),
          role: "editor",
          updatedAt: new Date("2026-07-25T00:00:00.000Z")
        }
      }),
    };
    const service = createCliUserService({ repository });

    const output = await service.setPassword({
      email: " Disabled@Example.COM ",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:set_password"
    });

    expect(repository.setPassword).toHaveBeenCalledWith({
      email: "disabled@example.com",
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "argon2-hash",
      requestId: "cli:set_password"
    });
    expect(output).toMatchObject({
      code: "USER_PASSWORD_SET",
      message: "Password was updated and active sessions were revoked.",
      user: {
        active: false,
        email: "disabled@example.com",
        role: "editor"
      }
    });
    expect(JSON.stringify(output)).toContain("\"sessionsRevoked\":3");
    expect(JSON.stringify(output)).not.toContain("argon2-hash");
  });

  it("does not retain plaintext password fields on the service instance", () => {
    const service = createCliUserService({
      repository: {
        bootstrapFirstAdmin: vi.fn(),
        createUser: vi.fn(),
        setPassword: vi.fn()
      }
    });

    expect(Object.keys(service)).not.toContain("password");
    expect(JSON.stringify(service)).not.toContain("plaintext");
  });

  it("exits before updating when exact confirmation is missing", async () => {
    const repository = {
      bootstrapFirstAdmin: vi.fn(),
      createUser: vi.fn(),
      setPassword: vi.fn()
    };
    const terminal = {
      close: vi.fn(async () => undefined),
      confirmExact: vi.fn().mockResolvedValue(false),
      promptSecret: vi.fn().mockResolvedValue("a".repeat(15)),
      promptVisible: vi.fn().mockResolvedValue("target@example.com"),
      writeSafe: vi.fn()
    };

    await expect(
      runUserSetPasswordCommand({
        clock: () => new Date("2026-07-25T00:00:00.000Z"),
        hasher: fakeHasher(),
        randomUUID: () => "cli-request-id",
        repository,
        terminal
      })
    ).resolves.toBe(1);
    expect(repository.setPassword).not.toHaveBeenCalled();
    expect(terminal.confirmExact).toHaveBeenCalledWith(
      "Type SET PASSWORD to continue: ",
      "SET PASSWORD"
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
