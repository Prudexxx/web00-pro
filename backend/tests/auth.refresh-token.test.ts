import { describe, expect, it } from "vitest";
import { createRefreshTokenService } from "../src/modules/auth/refresh-token.service.js";

describe("refresh token service", () => {
  it("generates opaque base64url tokens from 48 random bytes", () => {
    const service = createRefreshTokenService();
    const token = service.generateRawToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(token.split(".")).toHaveLength(1);
  });

  it("hashes raw tokens as SHA-256 lowercase hex", () => {
    const service = createRefreshTokenService();

    expect(service.hashRawToken("raw-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashRawToken("raw-token")).toBe(
      service.hashRawToken("raw-token")
    );
  });
});
