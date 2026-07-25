import { describe, expect, it, vi } from "vitest";
import { createAuthAuditService } from "../src/modules/auth/auth-audit.js";

describe("auth audit helpers", () => {
  it("passes through only approved safe audit fields", () => {
    const audit = createAuthAuditService({
      fingerprintSecret: Buffer.alloc(32, 9)
    });

    expect(
      audit.createSafeAuditInput({
        action: "auth.logout",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        entityId: "22222222-2222-4222-8222-222222222222",
        ipHash: "safe-ip",
        requestId: "req_audit",
        userAgentHash: "safe-agent"
      })
    ).toEqual({
      action: "auth.logout",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      entityId: "22222222-2222-4222-8222-222222222222",
      ipHash: "safe-ip",
      requestId: "req_audit",
      userAgentHash: "safe-agent"
    });
  });

  it("logs failed login with hashed email and no raw secret material", () => {
    const logger = { log: vi.fn() };
    const audit = createAuthAuditService({
      fingerprintSecret: Buffer.alloc(32, 9)
    });

    audit.logFailedLogin({
      email: "admin@example.com",
      environment: "test",
      logger,
      requestId: "req_login",
      service: "web00-backend",
      time: new Date("2026-07-25T00:00:00.000Z")
    });

    const entry = logger.log.mock.calls[0]?.[0];

    expect(entry).toMatchObject({
      event: "auth.login.failed",
      level: "warn",
      requestId: "req_login"
    });
    expect(JSON.stringify(entry)).not.toContain("admin@example.com");
    expect(JSON.stringify(entry)).not.toMatch(/password|token|cookie|secret/i);
  });
});
