import { describe, expect, it } from "vitest";
import {
  parseAdminUserListQuery,
  parseChangeUserRoleBody,
  parseUserIdParams
} from "../src/modules/admin/users/user.schemas.js";

describe("admin user validation", () => {
  it("applies approved list defaults and trims search", () => {
    expect(parseAdminUserListQuery({ search: " admin@example.com " })).toEqual({
      direction: "desc",
      limit: 50,
      page: 1,
      search: "admin@example.com",
      sort: "createdAt"
    });
  });

  it("rejects unknown list query fields and oversized limits", () => {
    expect(() => parseAdminUserListQuery({ unknown: "1" })).toThrow();
    expect(() => parseAdminUserListQuery({ limit: "101" })).toThrow();
  });

  it("parses strict role body and UUID params", () => {
    expect(parseChangeUserRoleBody({ role: "admin" })).toEqual({ role: "admin" });
    expect(() => parseChangeUserRoleBody({ role: "admin", extra: true })).toThrow();
    expect(parseUserIdParams({ id: "11111111-1111-4111-8111-111111111111" })).toEqual({
      id: "11111111-1111-4111-8111-111111111111"
    });
  });
});
