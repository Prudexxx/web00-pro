import { describe, expect, it } from "vitest";
import {
  createLoginRateLimitKey,
  createLoginRateLimiter,
  createRefreshRateLimiter
} from "../src/modules/auth/auth-rate-limit.js";

describe("auth rate limit helpers", () => {
  it("builds login keys from an IP prefix and normalized email hash without raw email", () => {
    const key = createLoginRateLimitKey({
      email: " Admin@Example.COM ",
      ip: "2001:db8:abcd:0012::1"
    });

    expect(key).toContain("login:");
    expect(key).toMatch(/[a-f0-9]{64}$/);
    expect(key).not.toContain("Admin");
    expect(key).not.toContain("example.com");
  });

  it("creates separate login and refresh limiter middleware", () => {
    const loginLimiter = createLoginRateLimiter();
    const refreshLimiter = createRefreshRateLimiter();

    expect(typeof loginLimiter).toBe("function");
    expect(typeof refreshLimiter).toBe("function");
    expect(loginLimiter).not.toBe(refreshLimiter);
  });
});
