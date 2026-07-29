import argon2 from "argon2";
import type { PasswordHasher } from "./auth.types.js";

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32
} as const;

const DUMMY_PASSWORD = "web00-dummy-password";
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$eHh4eHh4eHh4eHh4eHh4eA$wL33vEKDtDxiBaEp3VXsp6TJqgz4Uy6S37sHf38SlUY";

export function createArgon2PasswordHasher(): PasswordHasher {
  return {
    hash: (password) => argon2.hash(password, ARGON2_OPTIONS),
    verify: (hash, password) => argon2.verify(hash, password),
    verifyDummy: async (password) => {
      await argon2.verify(DUMMY_HASH, password || DUMMY_PASSWORD);
    }
  };
}
