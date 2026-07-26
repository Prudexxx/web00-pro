import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import {
  createPrismaReadinessProbe,
  createReadinessService
} from "../src/modules/readiness/readiness.service.js";
import { createReadinessRouter } from "../src/modules/readiness/readiness.routes.js";
import type { ReadinessService } from "../src/modules/readiness/readiness.types.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

function createReadinessApp(service: ReadinessService) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use("/api/ready", createReadinessRouter({ service }));

  return app;
}

describe("readiness service", () => {
  it("returns ready when the probe succeeds", async () => {
    const probe = { check: vi.fn().mockResolvedValue(undefined) };
    const service = createReadinessService({ probe });

    await expect(service.check()).resolves.toBe("ready");
    expect(probe.check).toHaveBeenCalledTimes(1);
  });

  it("returns not_ready when the probe fails without exposing raw errors", async () => {
    const probe = {
      check: vi.fn().mockRejectedValue(new Error("postgres://secret@db.example.com"))
    };
    const service = createReadinessService({ probe });

    await expect(service.check()).resolves.toBe("not_ready");
    expect(JSON.stringify(await service.check())).not.toContain("secret");
    expect(probe.check).toHaveBeenCalledTimes(2);
  });

  it("uses the existing Prisma client for a single read probe", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ one: 1 }])
    };
    const probe = createPrismaReadinessProbe(prisma);

    await expect(probe.check()).resolves.toBeUndefined();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/ready", () => {
  it("returns 200 ready with no-store cache control", async () => {
    const service = { check: vi.fn().mockResolvedValue("ready" as const) };
    const response = await request(createReadinessApp(service))
      .get("/api/ready")
      .expect("Cache-Control", "no-store")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(response.body).toEqual({ status: "ready" });
    expect(service.check).toHaveBeenCalledTimes(1);
  });

  it("returns 503 not_ready without raw error or stack output", async () => {
    const service = { check: vi.fn().mockResolvedValue("not_ready" as const) };
    const response = await request(createReadinessApp(service))
      .get("/api/ready")
      .expect("Cache-Control", "no-store")
      .expect(503)
      .expect("Content-Type", /application\/json/);

    expect(response.body).toEqual({ status: "not_ready" });
    expect(JSON.stringify(response.body)).not.toContain("postgres");
    expect(JSON.stringify(response.body)).not.toContain("Error:");
    expect(JSON.stringify(response.body)).not.toContain("stack");
    expect(service.check).toHaveBeenCalledTimes(1);
  });

  it("is mounted by createApp through an injected readiness service", async () => {
    const readinessService = { check: vi.fn().mockResolvedValue("ready" as const) };
    const response = await request(createApp({ env: testEnv, readinessService }))
      .get("/api/ready")
      .expect(200);

    expect(response.body).toEqual({ status: "ready" });
    expect(readinessService.check).toHaveBeenCalledTimes(1);
  });
});
