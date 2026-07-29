import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  createRequestId,
  isValidRequestId,
  requestIdHeaderName,
  requestIdMiddleware,
  selectRequestId
} from "../src/lib/request-id.js";

describe("request id contract", () => {
  it("accepts safe request id values only", () => {
    expect(isValidRequestId("req_123-abc:trace.1")).toBe(true);
    expect(isValidRequestId("")).toBe(false);
    expect(isValidRequestId("x".repeat(81))).toBe(false);
    expect(isValidRequestId("request id with spaces")).toBe(false);
    expect(isValidRequestId("../secret")).toBe(false);
  });

  it("creates a safe generated request id", () => {
    const requestId = createRequestId();

    expect(requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(isValidRequestId(requestId)).toBe(true);
  });

  it("preserves a valid incoming request id", () => {
    expect(selectRequestId("req_owner_provided-1")).toBe("req_owner_provided-1");
  });

  it("replaces invalid incoming request ids", () => {
    const requestId = selectRequestId("request id with spaces");

    expect(requestId).not.toBe("request id with spaces");
    expect(requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("stores and returns the request id from middleware", () => {
    const get = vi.fn().mockReturnValue("req_incoming-1");
    const request = { get } as unknown as Request;
    const setHeader = vi.fn();
    const response = { locals: {}, setHeader } as unknown as Response;
    const next: NextFunction = vi.fn();

    requestIdMiddleware(request, response, next);

    expect(get).toHaveBeenCalledWith(requestIdHeaderName);
    expect(response.locals.requestId).toBe("req_incoming-1");
    expect(setHeader).toHaveBeenCalledWith(requestIdHeaderName, "req_incoming-1");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
