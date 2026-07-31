import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

describe("GET /api/version", () => {
  it("returns safe build identity without database access or raw environment output", async () => {
    const response = await request(createApp({
      env: testEnv,
      versionInfo: {
        branch: "feat/web00-qamax-blocker-closure",
        commit: "7f1abddc7e0bf5bc076bf495f79aadf1e0bcc522",
        version: "0.0.0-test"
      }
    }))
      .get("/api/version")
      .expect("Cache-Control", "no-store")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(response.body).toEqual({
      data: {
        branch: "feat/web00-qamax-blocker-closure",
        commit: "7f1abddc7e0bf5bc076bf495f79aadf1e0bcc522",
        environment: "test",
        service: "web00-backend",
        version: "0.0.0-test"
      }
    });
    expect(JSON.stringify(response.body)).not.toMatch(/DATABASE_URL|JWT|TOKEN|SECRET|process\.env|Render|C:\\|D:\\/i);
  });

  it("bounds unsafe build identity fields to null instead of echoing raw values", async () => {
    const response = await request(createApp({
      env: testEnv,
      versionInfo: {
        branch: "feat/web00 backend production with spaces and too much extra text ".repeat(4),
        commit: "not-a-sha",
        version: "<script>alert(1)</script>"
      }
    }))
      .get("/api/version")
      .expect(200);

    expect(response.body.data).toEqual({
      branch: null,
      commit: null,
      environment: "test",
      service: "web00-backend",
      version: null
    });
  });
});
