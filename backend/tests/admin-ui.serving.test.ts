import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import { createAdminUiRouter } from "../src/modules/admin-ui/admin-ui.routes.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-test"
};

describe("admin UI static serving", () => {
  it("serves /admin and /admin/ as no-store HTML", async () => {
    const app = createApp({
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    await request(app)
      .get("/admin")
      .expect("Cache-Control", /no-store/)
      .expect("Content-Type", /html/)
      .expect(200);
    await request(app)
      .get("/admin/")
      .expect("Cache-Control", /no-store/)
      .expect("Content-Type", /html/)
      .expect(200);
  });

  it("serves CSS and JavaScript assets with no-store cache policy", async () => {
    const app = createApp({
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    await request(app)
      .get("/admin/assets/admin.css")
      .expect("Cache-Control", /no-store/)
      .expect("Content-Type", /text\/css/)
      .expect(200);
    await request(app)
      .get("/admin/assets/main.js")
      .expect("Cache-Control", /no-store/)
      .expect("Content-Type", /javascript/)
      .expect(200);
  });

  it("returns controlled responses for missing assets and dotfile requests", async () => {
    const app = createApp({
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    const missing = await request(app)
      .get("/admin/assets/missing.js")
      .expect("Cache-Control", /no-store/)
      .expect(404);
    const dotfile = await request(app)
      .get("/admin/assets/.env")
      .expect("Cache-Control", /no-store/)
      .expect(404);

    expect(missing.body.error).toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: "Route not found."
    });
    expect(JSON.stringify(dotfile.body)).not.toContain("SUPABASE");
    expect(JSON.stringify(dotfile.body)).not.toContain("DATABASE");
  });

  it("does not expose directory listings or directory redirects", async () => {
    const app = createApp({
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    const response = await request(app)
      .get("/admin/assets")
      .expect("Cache-Control", /no-store/)
      .expect(404);

    expect(response.headers.location).toBeUndefined();
    expect(response.text).not.toContain("Index of");
  });

  it("does not intercept unrelated API routes", async () => {
    const adminRoutes = express.Router();

    adminRoutes.get("/probe", (_request, response) => {
      response.json({ data: "api" });
    });

    const app = createApp({
      adminRoutes,
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    const response = await request(app).get("/api/admin/probe").expect(200);

    expect(response.body).toEqual({ data: "api" });
  });

  it("preserves the current unknown non-admin not-found contract", async () => {
    const app = createApp({
      adminUiRoutes: createAdminUiRouter({
        nodeEnv: "test",
        storagePublicOrigin: "https://storage.example.test"
      }),
      env: testEnv
    });

    const response = await request(app).get("/not-admin").expect(404);

    expect(response.body.error).toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: "Route not found."
    });
  });
});
