import { createHash, randomBytes } from "node:crypto";
import type { RefreshTokenService } from "./auth.types.js";

export function createRefreshTokenService(): RefreshTokenService {
  return {
    generateRawToken: () => randomBytes(48).toString("base64url"),
    hashRawToken: (rawToken) =>
      createHash("sha256").update(rawToken, "utf8").digest("hex")
  };
}
