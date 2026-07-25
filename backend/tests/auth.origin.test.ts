import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createOriginGuard } from "../src/modules/auth/auth-origin.js";

function createGuardedApp(options: Parameters<typeof createOriginGuard>[0]) {
  const app = express();

  app.post("/guarded", createOriginGuard(options), (_request, response) => {
    response.status(204).end();
  });
  app.use(errorHandler);

  return app;
}

describe("auth origin guard", () => {
  it("requires exact production Origin", async () => {
    const app = createGuardedApp({
      authOrigin: "https://admin.example.com",
      nodeEnv: "production"
    });

    await request(app).post("/guarded").expect(403);
    await request(app)
      .post("/guarded")
      .set("Origin", "https://wrong.example.com")
      .expect(403);
    await request(app)
      .post("/guarded")
      .set("Origin", "https://admin.example.com")
      .expect(204);
  });

  it("allows missing Origin in development and test but rejects configured mismatches", async () => {
    const app = createGuardedApp({
      authOrigin: "http://127.0.0.1:3000",
      nodeEnv: "test"
    });

    await request(app).post("/guarded").expect(204);
    await request(app)
      .post("/guarded")
      .set("Origin", "http://localhost:3000")
      .expect(403);
  });
});
