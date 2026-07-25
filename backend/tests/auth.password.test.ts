import { describe, expect, it } from "vitest";
import {
  ARGON2_OPTIONS,
  createArgon2PasswordHasher
} from "../src/modules/auth/password.service.js";

describe("password service", () => {
  it("uses the approved Argon2id production options", () => {
    expect(ARGON2_OPTIONS).toEqual({
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32
    });
  });

  it("hashes with Argon2 and verifies correct and wrong passwords", async () => {
    const hasher = createArgon2PasswordHasher();
    const hash = await hasher.hash("correct horse battery staple");

    expect(hash).toContain("$argon2id$");
    await expect(hasher.verify(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(hasher.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("always executes the dummy verification path without leaking a result", async () => {
    const hasher = createArgon2PasswordHasher();

    await expect(hasher.verifyDummy("anything")).resolves.toBeUndefined();
  });
});
