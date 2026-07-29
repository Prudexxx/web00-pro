import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createAccessTokenService } from "../src/modules/auth/access-token.service.js";

const secret = Buffer.alloc(32, 5);

describe("access token service", () => {
  it("signs and verifies approved HS256 claims", async () => {
    const service = createAccessTokenService({
      audience: "web00-admin",
      issuer: "web00-backend",
      secret,
      ttlSeconds: 900
    });

    const token = await service.sign({
      role: "admin",
      sessionId: "22222222-2222-4222-8222-222222222222",
      tokenId: "33333333-3333-4333-8333-333333333333",
      userId: "11111111-1111-4111-8111-111111111111"
    });
    const claims = await service.verify(token);

    expect(claims).toMatchObject({
      audience: "web00-admin",
      issuer: "web00-backend",
      role: "admin",
      sessionId: "22222222-2222-4222-8222-222222222222",
      subject: "11111111-1111-4111-8111-111111111111",
      tokenId: "33333333-3333-4333-8333-333333333333"
    });
    expect(claims.expiresAtEpochSeconds - claims.issuedAtEpochSeconds).toBe(900);
  });

  it("maps malformed tokens to safe UNAUTHORIZED", async () => {
    const service = createAccessTokenService({
      audience: "web00-admin",
      issuer: "web00-backend",
      secret,
      ttlSeconds: 900
    });

    await expect(service.verify("not-a-jwt")).rejects.toBeInstanceOf(AppError);
    await expect(service.verify("not-a-jwt")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401
    });
  });
});
