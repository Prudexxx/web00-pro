import { describe, expect, it } from "vitest";
import { mapSafeAdminUser } from "../src/modules/admin/users/user.mapper.js";

describe("admin user mapper", () => {
  it("returns only the approved safe user fields", () => {
    const mapped = mapSafeAdminUser({
      active: true,
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
      email: "admin@example.com",
      id: "11111111-1111-4111-8111-111111111111",
      lastLoginAt: null,
      passwordHash: "must-not-leak",
      refreshSessions: [{ tokenHash: "must-not-leak" }],
      role: "admin",
      updatedAt: new Date("2026-07-25T01:00:00.000Z")
    } as never);

    expect(mapped).toEqual({
      active: true,
      createdAt: "2026-07-25T00:00:00.000Z",
      email: "admin@example.com",
      id: "11111111-1111-4111-8111-111111111111",
      lastLoginAt: null,
      role: "admin",
      updatedAt: "2026-07-25T01:00:00.000Z"
    });
    expect(JSON.stringify(mapped)).not.toContain("passwordHash");
    expect(JSON.stringify(mapped)).not.toContain("tokenHash");
  });
});
