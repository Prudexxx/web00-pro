import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authNoStore, setAuthNoStoreHeaders } from "../src/modules/auth/auth-cache-control.js";

describe("auth cache-control", () => {
  it("sets no-store and optional pragma without leaking sensitive values", () => {
    const response = {
      setHeader: new Map<string, string>(),
      set(name: string, value: string) {
        this.setHeader.set(name, value);
      }
    };

    setAuthNoStoreHeaders(response as never, { pragma: true });

    expect(response.setHeader.get("Cache-Control")).toBe("no-store");
    expect(response.setHeader.get("Pragma")).toBe("no-cache");
    expect([...response.setHeader.values()].join(" ")).not.toMatch(/token|cookie|secret/i);
  });

  it("applies headers before route handlers and errors", async () => {
    const app = express();

    app.get("/ok", authNoStore({ pragma: true }), (_request, response) => {
      response.json({ data: "ok" });
    });
    app.get("/fail", authNoStore(), () => {
      throw new Error("safe");
    });
    app.use((_error: unknown, _request: express.Request, response: express.Response) => {
      response.status(500).json({ error: "safe" });
    });

    await request(app)
      .get("/ok")
      .expect("Cache-Control", "no-store")
      .expect("Pragma", "no-cache")
      .expect(200);
    await request(app)
      .get("/fail")
      .expect("Cache-Control", "no-store")
      .expect(500);
  });
});
