import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  createCredentialVerifier,
  normalizeEmail
} from "../src/modules/auth/auth-credentials.service.js";
import type { AuthRepository, PasswordHasher } from "../src/modules/auth/auth.types.js";

const activeUser = {
  active: true,
  email: "admin@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  passwordHash: "hash",
  role: "admin" as const
};

function createRepository(user: typeof activeUser | null): Pick<AuthRepository, "findUserByEmail"> {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(user)
  };
}

function createHasher(verified: boolean): PasswordHasher {
  return {
    hash: vi.fn(),
    verify: vi.fn().mockResolvedValue(verified),
    verifyDummy: vi.fn().mockResolvedValue(undefined)
  };
}

describe("credential verifier", () => {
  it("normalizes emails before lookup", async () => {
    const repository = createRepository(activeUser);
    const hasher = createHasher(true);
    const verifier = createCredentialVerifier({ hasher, repository });

    await verifier.verify({ email: " ADMIN@Example.COM ", password: "password" });

    expect(normalizeEmail(" ADMIN@Example.COM ")).toBe("admin@example.com");
    expect(repository.findUserByEmail).toHaveBeenCalledWith("admin@example.com");
  });

  it("returns the safe user for valid active credentials", async () => {
    const verifier = createCredentialVerifier({
      hasher: createHasher(true),
      repository: createRepository(activeUser)
    });

    await expect(
      verifier.verify({ email: "admin@example.com", password: "password" })
    ).resolves.toEqual({
      active: true,
      email: activeUser.email,
      id: activeUser.id,
      passwordHash: activeUser.passwordHash,
      role: activeUser.role
    });
  });

  it.each([
    ["unknown email", null, true, "verifyDummy"],
    ["wrong password", activeUser, false, "verify"],
    ["inactive user", { ...activeUser, active: false }, true, "verifyDummy"]
  ])(
    "returns the same INVALID_CREDENTIALS error for %s",
    async (_caseName, user, verified, expectedCall) => {
      const hasher = createHasher(verified);
      const verifier = createCredentialVerifier({
        hasher,
        repository: createRepository(user)
      });

      await expect(
        verifier.verify({ email: "admin@example.com", password: "password" })
      ).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
        statusCode: 401
      });
      expect(
        expectedCall === "verifyDummy" ? hasher.verifyDummy : hasher.verify
      ).toHaveBeenCalledTimes(1);
    }
  );

  it("does not include token, cookie, session, JWT, or HTTP responsibilities", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "modules", "auth", "auth-credentials.service.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/jwt|cookie|session|express|request|response/i);
    expect(AppError).toBeDefined();
  });
});
