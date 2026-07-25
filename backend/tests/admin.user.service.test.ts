import { describe, expect, it, vi } from "vitest";
import { createAdminUserService } from "../src/modules/admin/users/user.service.js";

const admin = {
  email: "actor@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "admin" as const,
  sessionId: "22222222-2222-4222-8222-222222222222",
  tokenId: "33333333-3333-4333-8333-333333333333"
};

const userRecord = {
  active: true,
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  email: "target@example.com",
  id: "44444444-4444-4444-8444-444444444444",
  lastLoginAt: null,
  role: "editor" as const,
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

describe("AdminUserService", () => {
  it("blocks self-role change before repository mutation", async () => {
    const repository = fakeRepository();
    const service = createAdminUserService({ repository });

    await expect(
      service.changeRole(admin.id, "editor", context(admin.id))
    ).rejects.toMatchObject({
      code: "SELF_ROLE_CHANGE_FORBIDDEN",
      statusCode: 403
    });
    expect(repository.changeRole).not.toHaveBeenCalled();
  });

  it("blocks self-disable before repository mutation", async () => {
    const repository = fakeRepository();
    const service = createAdminUserService({ repository });

    await expect(service.disable(admin.id, context(admin.id))).rejects.toMatchObject({
      code: "SELF_DISABLE_FORBIDDEN",
      statusCode: 403
    });
    expect(repository.disable).not.toHaveBeenCalled();
  });

  it("maps list rows to safe DTOs with pagination metadata", async () => {
    const repository = fakeRepository();
    repository.listUsers.mockResolvedValue({ rows: [userRecord], total: 1 });
    const service = createAdminUserService({ repository });

    await expect(
      service.listUsers({
        direction: "desc",
        limit: 50,
        page: 1,
        sort: "createdAt"
      })
    ).resolves.toEqual({
      data: [
        expect.objectContaining({
          email: "target@example.com",
          role: "editor"
        })
      ],
      meta: {
        limit: 50,
        page: 1,
        total: 1,
        totalPages: 1
      }
    });
  });
});

function fakeRepository() {
  return {
    changeRole: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    getUser: vi.fn(),
    listUsers: vi.fn()
  };
}

function context(actorUserId: string) {
  return {
    actorUserId,
    now: new Date("2026-07-25T00:00:00.000Z"),
    requestId: "req_b6_user_service",
    source: "api" as const
  };
}
