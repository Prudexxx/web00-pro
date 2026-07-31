import { describe, expect, it, vi } from "vitest";

import { visibleNavigation } from "../src/admin/assets/screens/shell.js";
import {
  buildUserRolePayload,
  buildUsersListPath,
  createUsersScreen,
  getAvailableUserActions,
  normalizeUsersFilters
} from "../src/admin/assets/screens/users.js";
import {
  click,
  createDeferred,
  createFakeDocument,
  setValue,
  submit,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin users screen", () => {
  it("keeps users navigation and actions admin-only", async () => {
    expect(visibleNavigation("editor").map((item) => item.id)).toEqual(["sites", "categories"]);
    expect(visibleNavigation("admin").map((item) => item.id)).toEqual(["sites", "categories", "users", "audit", "maintenance"]);
    expect(getAvailableUserActions(userFixture(), "editor", adminUser())).toEqual([]);

    const documentRef = createFakeDocument();
    const apiClient = { requestJson: vi.fn() };
    const screen = createUsersScreen({
      apiClient,
      currentUser: editorUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();

    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(screen.element.textContent).toContain("Недостаточно прав");
    expect(screen.element.textContent).not.toMatch(/Изменить роль|Отключить|Включить/);
  });

  it("builds current-contract user queries and role payloads only", () => {
    expect(buildUsersListPath({})).toBe("/api/admin/users?sort=createdAt&direction=desc&page=1&limit=50");
    expect(buildUsersListPath({
      active: false,
      direction: "asc",
      limit: 100,
      page: 4,
      role: "editor",
      search: ` ${"e".repeat(110)} `,
      sort: "email",
      unsupported: "drop"
    })).toBe(
      `/api/admin/users?search=${"e".repeat(100)}&role=editor&active=false&sort=email&direction=asc&page=4&limit=100`
    );
    expect(normalizeUsersFilters({
      active: "bad",
      direction: "bad",
      limit: 500,
      page: 0,
      role: "bad",
      search: "  team  ",
      sort: "bad"
    })).toEqual({
      direction: "desc",
      limit: 100,
      page: 1,
      search: "team",
      sort: "createdAt"
    });
    expect(normalizeUsersFilters({ page: 7, role: "admin" }, { filtersChanged: true }).page).toBe(1);
    expect(buildUserRolePayload("admin")).toEqual({ role: "admin" });
    expect(buildUserRolePayload("editor")).toEqual({ role: "editor" });
    expectValidationPath(() => buildUserRolePayload("owner"), "role");
  });

  it("loads safe user fields, renders text safely, and opens detail by exact route", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath === "/api/admin/users/00000000-0000-4000-8000-000000000002") {
          return Promise.resolve({ data: userFixture({ email: "detail@example.test" }) });
        }
        return Promise.resolve({
          data: [userFixture({
            email: '<img src=x onerror="boom">',
            passwordHash: "hash",
            sessionToken: "token"
          })],
          meta: metaFixture(1)
        });
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    expect(screen.element.textContent).toContain('<img src=x onerror="boom">');
    expect(screen.element.textContent).not.toContain("hash");
    expect(screen.element.textContent).not.toContain("token");
    expect(screen.element.querySelector("img")).toBeNull();

    click(screen.element, '[data-action="view-user"]');
    await waitFor(() => screen.element.textContent.includes("detail@example.test"));

    expect(requests.some((request) => request.requestPath === "/api/admin/users")).toBe(false);
    expect(requests.some((request) => request.requestPath === "/api/admin/users/00000000-0000-4000-8000-000000000002")).toBe(true);
    expect(screen.element.textContent).not.toMatch(/Создать пользователя|password|reset-password|Удалить пользователя|session|invite/i);
  });

  it("aborts stale list requests and renders loading, empty, and error states", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const responses = [
      deferred.promise,
      Promise.resolve({ data: [userFixture()], meta: metaFixture(1) }),
      Promise.resolve({ data: [], meta: metaFixture(0) }),
      Promise.reject({ message: "Users failed.", requestId: "req_users" })
    ];
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        return responses.shift();
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    const firstLoad = screen.load();
    expect(screen.element.textContent).toContain("Загрузка");
    const secondLoad = screen.load();
    deferred.resolve({ data: [userFixture({ email: "stale@example.test" })], meta: metaFixture(1) });
    await Promise.all([firstLoad, secondLoad]);
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(screen.element.textContent).not.toContain("stale@example.test");

    await screen.load();
    expect(screen.element.textContent).toContain("Пользователей пока нет");

    await screen.load();
    expect(screen.element.textContent).toContain("Users failed.");
    expect(screen.element.textContent).toContain("req_users");
  });

  it("changes roles through confirmation with exact route/body and blocks duplicate submits", async () => {
    const documentRef = createFakeDocument();
    const roleChange = createDeferred();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (options.method === "PATCH") {
          return roleChange.promise;
        }
        return Promise.resolve({ data: [userFixture({ role: "editor" })], meta: metaFixture(1) });
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    setValue(screen.element, "targetUserRole", "admin");
    submit(screen.element, '[data-action="change-user-role"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => requests.filter((request) => request.options.method === "PATCH").length === 1);

    const patch = requests.find((request) => request.options.method === "PATCH");
    expect(patch.requestPath).toBe("/api/admin/users/00000000-0000-4000-8000-000000000002/role");
    expect(patch.options.body).toEqual({ role: "admin" });

    roleChange.resolve({ data: { user: userFixture({ role: "admin" }) } });
    await waitFor(() => requests.filter((request) => request.options.method === "GET").length >= 2);
  });

  it("shows controlled role/self/last-admin errors as text", async () => {
    const documentRef = createFakeDocument();
    const errors = [
      { code: "SELF_ROLE_CHANGE_FORBIDDEN", message: '<b>SELF_ROLE_CHANGE_FORBIDDEN</b>', requestId: "req_self_role" },
      { code: "LAST_ACTIVE_ADMIN", message: "LAST_ACTIVE_ADMIN", requestId: "req_last_admin" },
      { code: "USER_ROLE_UNCHANGED", message: "USER_ROLE_UNCHANGED", requestId: "req_unchanged" }
    ];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (options.method === "PATCH") {
          return Promise.reject(errors.shift());
        }
        return Promise.resolve({ data: [userFixture({ role: "editor" })], meta: metaFixture(1) });
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    for (const expected of ["SELF_ROLE_CHANGE_FORBIDDEN", "LAST_ACTIVE_ADMIN", "USER_ROLE_UNCHANGED"]) {
      setValue(screen.element, "targetUserRole", "admin");
      submit(screen.element, '[data-action="change-user-role"]');
      click(screen.element, '[data-action="confirm-dialog"]');
      await waitFor(() => screen.element.textContent.includes(expected));
      expect(screen.element.querySelector("b")).toBeNull();
      click(screen.element, '[data-action="cancel-dialog"]');
    }
  });

  it("disables and enables users with POST requests that send no invented body", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const listResponses = [
      { data: [userFixture({ active: true })], meta: metaFixture(1) },
      { data: [userFixture({ active: false })], meta: metaFixture(1) },
      { data: [userFixture({ active: true })], meta: metaFixture(1) }
    ];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        if (requestPath.endsWith("/disable") || requestPath.endsWith("/enable")) {
          return Promise.resolve({ data: { user: userFixture() } });
        }
        return Promise.resolve(listResponses.shift() ?? { data: [userFixture()], meta: metaFixture(1) });
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    click(screen.element, '[data-action="disable-user"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => requests.some((request) => request.requestPath.endsWith("/disable")));

    const disable = requests.find((request) => request.requestPath.endsWith("/disable"));
    expect(disable.requestPath).toBe("/api/admin/users/00000000-0000-4000-8000-000000000002/disable");
    expect(disable.options.method).toBe("POST");
    expect(disable.options.body).toBeUndefined();

    await waitFor(() => screen.element.querySelector('[data-action="enable-user"]') !== null);
    click(screen.element, '[data-action="enable-user"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => requests.some((request) => request.requestPath.endsWith("/enable")));

    const enable = requests.find((request) => request.requestPath.endsWith("/enable"));
    expect(enable.requestPath).toBe("/api/admin/users/00000000-0000-4000-8000-000000000002/enable");
    expect(enable.options.method).toBe("POST");
    expect(enable.options.body).toBeUndefined();
  });

  it("renders disable and enable server protection errors safely", async () => {
    const documentRef = createFakeDocument();
    let disabledMode = false;
    const errors = [
      { code: "SELF_DISABLE_FORBIDDEN", message: "SELF_DISABLE_FORBIDDEN", requestId: "req_self_disable" },
      { code: "LAST_ACTIVE_ADMIN", message: "LAST_ACTIVE_ADMIN", requestId: "req_last_disable" },
      { code: "USER_ALREADY_DISABLED", message: "USER_ALREADY_DISABLED", requestId: "req_disabled" },
      { code: "USER_ALREADY_ACTIVE", message: "USER_ALREADY_ACTIVE", requestId: "req_active" }
    ];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        if (requestPath.endsWith("/disable") || requestPath.endsWith("/enable")) {
          return Promise.reject(errors.shift());
        }
        return Promise.resolve({ data: [userFixture({ active: disabledMode !== true })], meta: metaFixture(1) });
      })
    };
    const screen = createUsersScreen({
      apiClient,
      currentUser: adminUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    for (const expected of ["SELF_DISABLE_FORBIDDEN", "LAST_ACTIVE_ADMIN", "USER_ALREADY_DISABLED"]) {
      click(screen.element, '[data-action="disable-user"]');
      click(screen.element, '[data-action="confirm-dialog"]');
      await waitFor(() => screen.element.textContent.includes(expected));
      click(screen.element, '[data-action="cancel-dialog"]');
    }

    disabledMode = true;
    await screen.load();
    click(screen.element, '[data-action="enable-user"]');
    click(screen.element, '[data-action="confirm-dialog"]');
    await waitFor(() => screen.element.textContent.includes("USER_ALREADY_ACTIVE"));
  });
});

function adminUser() {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin"
  };
}

function editorUser() {
  return {
    email: "editor@example.test",
    id: "00000000-0000-4000-8000-000000000099",
    role: "editor"
  };
}

function userFixture(overrides = {}) {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    email: "editor@example.test",
    id: "00000000-0000-4000-8000-000000000002",
    lastLoginAt: "2026-07-28T10:00:00.000Z",
    role: "editor",
    updatedAt: "2026-07-28T10:30:00.000Z",
    ...overrides
  };
}

function metaFixture(total) {
  return {
    limit: 50,
    page: 1,
    total,
    totalPages: total > 0 ? 1 : 0
  };
}

function expectValidationPath(action, path) {
  try {
    action();
  } catch (error) {
    expect(error.details?.[0]?.path).toBe(path);
    return;
  }

  throw new Error(`Expected validation error for ${path}`);
}
