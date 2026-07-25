import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAccessTokenService } from "../src/modules/auth/access-token.service.js";
import { createAuthMiddleware } from "../src/modules/auth/auth.middleware.js";
import type { AuthRepository } from "../src/modules/auth/auth.types.js";

const accessTokens = createAccessTokenService({
  audience: "web00-admin",
  issuer: "web00-backend",
  secret: Buffer.alloc(32, 8),
  ttlSeconds: 900
});

function createApp(repository: Pick<AuthRepository, "findActiveUserById">) {
  const app = express();

  app.get(
    "/me",
    createAuthMiddleware({ accessTokens, repository }),
    (request, response) => {
      response.json({ data: (request as never as { auth: unknown }).auth });
    }
  );
  app.use((_error: unknown, _request: express.Request, response: express.Response) => {
    response.status(401).json({ error: { code: "UNAUTHORIZED" } });
  });

  return app;
}

describe("auth middleware", () => {
  it("attaches a safe principal for valid bearer tokens", async () => {
    const repository = {
      findActiveUserById: vi.fn().mockResolvedValue({
        email: "admin@example.com",
        id: "11111111-1111-4111-8111-111111111111",
        role: "admin"
      })
    };
    const token = await accessTokens.sign({
      role: "admin",
      sessionId: "22222222-2222-4222-8222-222222222222",
      tokenId: "33333333-3333-4333-8333-333333333333",
      userId: "11111111-1111-4111-8111-111111111111"
    });

    const response = await request(createApp(repository))
      .get("/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({
      email: "admin@example.com",
      id: "11111111-1111-4111-8111-111111111111",
      role: "admin",
      sessionId: "22222222-2222-4222-8222-222222222222",
      tokenId: "33333333-3333-4333-8333-333333333333"
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("rejects missing bearer tokens before loading a user", async () => {
    const repository = {
      findActiveUserById: vi.fn()
    };

    await request(createApp(repository)).get("/me").expect(401);

    expect(repository.findActiveUserById).not.toHaveBeenCalled();
  });
});
