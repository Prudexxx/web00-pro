import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import type { AppLogEntry } from "../src/lib/logger.js";
import { healthResponseSchema } from "../src/modules/health/health.schema.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

describe("GET /api/health", () => {
  it("returns the approved health response", async () => {
    const now = new Date("2026-07-24T00:00:00.000Z");
    const app = createApp({ env: testEnv, now: () => now });
    const response = await request(app)
      .get("/api/health")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(healthResponseSchema.parse(response.body)).toEqual({
      data: {
        service: "web00-backend",
        status: "ok",
        time: "2026-07-24T00:00:00.000Z"
      }
    });
    expect(new Date(response.body.data.time).toISOString()).toBe(response.body.data.time);
    expect(JSON.stringify(response.body)).not.toContain("NODE_ENV");
    expect(JSON.stringify(response.body)).not.toContain("LOG_LEVEL");
    expect(JSON.stringify(response.body)).not.toContain("PORT");
  });

  it("adds a generated request id header", async () => {
    const app = createApp({ env: testEnv });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.header["x-request-id"]).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("preserves a valid request id header", async () => {
    const app = createApp({ env: testEnv });
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "req_owner-1")
      .expect(200);

    expect(response.header["x-request-id"]).toBe("req_owner-1");
  });

  it("replaces an invalid request id header", async () => {
    const app = createApp({ env: testEnv });
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "request id with spaces")
      .expect(200);

    expect(response.header["x-request-id"]).not.toBe("request id with spaces");
    expect(response.header["x-request-id"]).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("logs one safe JSON request entry through an injected memory logger", async () => {
    const entries: AppLogEntry[] = [];
    const app = createApp({
      env: testEnv,
      logger: {
        log: (entry) => {
          entries.push(entry);
        }
      },
      registerTestRoutes: (app) => {
        app.post("/test/logging", (_request, response) => {
          response.status(201).json({ ok: true });
        });
      }
    });

    await request(app)
      .post("/test/logging")
      .set("Authorization", "Bearer secret-token")
      .set("Cookie", "sid=secret-cookie")
      .send({ password: "secret-password", token: "secret-token" })
      .expect(201);

    expect(entries).toHaveLength(1);
    const entry = entries[0];

    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      environment: "test",
      level: "info",
      method: "POST",
      path: "/test/logging",
      service: "web00-backend",
      statusCode: 201
    });
    if (entry === undefined || !("requestId" in entry)) {
      throw new Error("Expected a request log entry.");
    }

    expect(entry.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(entry.time).toEqual(expect.any(String));
    expect(new Date(entry.time).toISOString()).toBe(entry.time);
    expect(entry.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(entry)).not.toContain("Authorization");
    expect(JSON.stringify(entry)).not.toContain("Cookie");
    expect(JSON.stringify(entry)).not.toContain("secret-token");
    expect(JSON.stringify(entry)).not.toContain("secret-cookie");
    expect(JSON.stringify(entry)).not.toContain("secret-password");
    expect(JSON.stringify(entry)).not.toContain("password");
    expect(JSON.stringify(entry)).not.toContain("token");
  });
});
