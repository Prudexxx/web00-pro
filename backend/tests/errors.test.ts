import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import {
  AppError,
  createErrorResponse,
  toAppError
} from "../src/lib/errors.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

describe("AppError response contract", () => {
  it("returns the approved error envelope with requestId", () => {
    const error = new AppError({
      code: "VALIDATION_ERROR",
      details: [{ path: "PORT", message: "Must be a valid port." }],
      message: "Invalid request.",
      statusCode: 400
    });

    expect(createErrorResponse(error, "req_test_123")).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ path: "PORT", message: "Must be a valid port." }],
        message: "Invalid request.",
        requestId: "req_test_123"
      }
    });
  });

  it("supports approved public catalog not-found error codes", () => {
    const siteError = new AppError({
      code: "SITE_NOT_FOUND",
      message: "Site not found.",
      statusCode: 404
    });
    const categoryError = new AppError({
      code: "CATEGORY_NOT_FOUND",
      message: "Category not found.",
      statusCode: 404
    });

    expect(createErrorResponse(siteError, "req_site")).toEqual({
      error: {
        code: "SITE_NOT_FOUND",
        message: "Site not found.",
        requestId: "req_site"
      }
    });
    expect(createErrorResponse(categoryError, "req_category")).toEqual({
      error: {
        code: "CATEGORY_NOT_FOUND",
        message: "Category not found.",
        requestId: "req_category"
      }
    });
  });

  it("maps unknown errors to a safe internal error", () => {
    const error = toAppError(new Error("database password leaked"));

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toBe("Internal server error.");
    expect(error.message).not.toContain("password");
  });

  it("maps malformed JSON parser errors to INVALID_JSON", () => {
    const parserError = Object.assign(new SyntaxError("raw parser details"), {
      status: 400,
      type: "entity.parse.failed"
    });
    const error = toAppError(parserError);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INVALID_JSON");
    expect(error.message).toBe("Invalid JSON body.");
    expect(error.message).not.toContain("raw parser details");
  });

  it("maps body size parser errors to PAYLOAD_TOO_LARGE", () => {
    const parserError = Object.assign(new Error("raw parser details"), {
      status: 413,
      type: "entity.too.large"
    });
    const error = toAppError(parserError);

    expect(error.statusCode).toBe(413);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(error.message).toBe("Request body too large.");
    expect(error.message).not.toContain("raw parser details");
  });

  it("delegates exactly once when headers are already sent", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const next: NextFunction = vi.fn();
    const response = {
      headersSent: true,
      json,
      locals: { requestId: "req_existing" },
      status
    } as unknown as Response;
    const error = new Error("late failure");

    errorHandler(error, {} as Request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});

describe("Express error handling", () => {
  it("returns ROUTE_NOT_FOUND for unknown routes", async () => {
    const app = createApp({ env: testEnv });
    const response = await request(app)
      .get("/not-found")
      .expect(404)
      .expect("Content-Type", /application\/json/);

    expect(response.body).toMatchObject({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found."
      }
    });
    expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("returns a safe INTERNAL_ERROR for thrown unknown errors", async () => {
    const app = createApp({
      env: testEnv,
      registerTestRoutes: (app) => {
        app.get("/test/internal-error", () => {
          throw new Error("secret stack marker");
        });
      }
    });
    const response = await request(app)
      .get("/test/internal-error")
      .set("X-Request-Id", "req_internal")
      .expect(500)
      .expect("Content-Type", /application\/json/);
    const serialized = JSON.stringify(response.body);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req_internal"
      }
    });
    expect(serialized).not.toContain("secret stack marker");
    expect(serialized).not.toContain("stack");
  });

  it("returns INVALID_JSON for malformed JSON bodies", async () => {
    const app = createApp({ env: testEnv });
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400)
      .expect("Content-Type", /application\/json/);

    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.message).toBe("Invalid JSON body.");
    expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(JSON.stringify(response.body)).not.toContain("Unexpected end");
  });

  it("returns PAYLOAD_TOO_LARGE for JSON bodies over 100kb", async () => {
    const app = createApp({ env: testEnv });
    const payload = JSON.stringify({ data: "x".repeat(102_401) });
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(413)
      .expect("Content-Type", /application\/json/);

    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.body.error.message).toBe("Request body too large.");
    expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(JSON.stringify(response.body)).not.toContain("entity.too.large");
  });
});
