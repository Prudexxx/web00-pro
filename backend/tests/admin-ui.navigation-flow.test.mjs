import { describe, expect, it, vi } from "vitest";

import { bootstrapAdminApp } from "../src/admin/assets/main.js";
import { createAuditScreen } from "../src/admin/assets/screens/audit.js";
import { createUsersScreen } from "../src/admin/assets/screens/users.js";
import {
  click,
  createFakeDocument,
  setValue,
  submit,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin UI bootstrapped navigation flow", () => {
  it("drives the complete admin click flow through all registered screens", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = createAdminFetch();
    const bootstrap = bootstrapAdminApp({
      autoLoadScreens: true,
      documentRef,
      fetchImpl,
      root
    });

    expect(root.textContent).toContain("Загрузка панели");
    await bootstrap;
    await waitFor(() => root.textContent.includes('Private <img onerror="x">'));

    expect(root.textContent).toContain("Администратор");
    expect(root.querySelector('[data-section="sites"]').getAttribute("aria-current")).toBe("page");
    expect(root.textContent).not.toContain("Раздел будет подключён");

    click(root, '[data-section="categories"]');
    await waitFor(() => root.textContent.includes("Список категорий обновлён"));
    expect(root.textContent).toContain("Категории");
    expect(root.querySelector('[data-section="categories"]').getAttribute("aria-current")).toBe("page");

    click(root, '[data-section="users"]');
    await waitFor(() => root.textContent.includes("Список пользователей обновлён"));
    expect(root.textContent).toContain("Пользователи");
    expect(root.textContent).toContain("long-user-email");

    click(root, '[data-section="audit"]');
    await waitFor(() => root.textContent.includes("Журнал аудита обновлён"));
    expect(root.textContent).toContain("Система / CLI");
    expect(root.textContent).toContain("<img onerror=");

    click(root, '[data-section="sites"]');
    await waitFor(() => root.textContent.includes('Private <img onerror="x">'));
    click(root, '[data-action="create-site"]');
    await waitFor(() => root.querySelector('[data-action="cancel-editor"]') !== null);
    click(root, '[data-action="cancel-editor"]');
    await waitFor(() => root.textContent.includes("Список сайтов обновлён"));

    click(root, '[data-action="edit-site"]');
    await waitFor(() => root.querySelector('[data-action="manage-images"]') !== null);
    click(root, '[data-action="manage-images"]');
    await waitFor(() => root.textContent.includes("Gallery"));
    expect(root.textContent).toContain("Gallery");
    click(root, '[data-action="back-to-sites"]');
    await waitFor(() => root.textContent.includes("Список сайтов обновлён"));

    click(root, '[data-action="logout"]');
    await waitFor(() => root.textContent.includes("Вход"));
    expect(root.textContent).not.toContain('Private <img onerror="x">');
    expect(root.textContent).not.toContain("long-user-email");
  });

  it("logs in as editor and keeps admin-only screens unreachable by navigation or direct render", async () => {
    const documentRef = createFakeDocument();
    const root = documentRef.createElement("main");
    const fetchImpl = createEditorLoginFetch();

    await bootstrapAdminApp({
      autoLoadScreens: true,
      documentRef,
      fetchImpl,
      root
    });
    expect(root.textContent).toContain("Вход");

    setValue(root, "email", "editor@example.test");
    setValue(root, "password", "secret-password");
    submit(root, "form");
    await waitFor(() => root.textContent.includes("Редактор"));
    await waitFor(() => root.textContent.includes("Список сайтов обновлён"));

    expect(root.textContent).toContain("Сайты");
    expect(root.textContent).toContain("Категории");
    expect(root.textContent).not.toContain("Пользователи");
    expect(root.textContent).not.toContain("Журнал");
    expect(root.querySelector('[data-section="users"]')).toBeNull();
    expect(root.querySelector('[data-section="audit"]')).toBeNull();
    expect(root.textContent).not.toMatch(/Опубликовать|Удалить навсегда|Снять/);

    click(root, '[data-section="categories"]');
    await waitFor(() => root.textContent.includes("Список категорий обновлён"));
    expect(root.textContent).not.toMatch(/Создать категорию|Редактировать|Удалить/);
    expect(root.querySelector('[data-action="create-category"]')).toBeNull();

    const usersScreen = createUsersScreen({
      apiClient: { requestJson: vi.fn() },
      currentUser: editorUser(),
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });
    await usersScreen.load();
    expect(usersScreen.element.textContent).toContain("Недостаточно прав");
    expect(usersScreen.element.textContent).not.toMatch(/Изменить роль|Отключить|Включить/);

    const auditScreen = createAuditScreen({
      apiClient: { requestJson: vi.fn() },
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });
    await auditScreen.load();
    expect(auditScreen.element.textContent).toContain("Недостаточно прав");
    expect(auditScreen.element.textContent).not.toMatch(/Удалить|Редактировать|Экспорт/);
  });
});

function createAdminFetch() {
  return vi.fn((requestPath, options = {}) => {
    if (requestPath === "/api/auth/refresh") {
      return Promise.resolve(jsonResponse(200, {
        data: { accessToken: "admin-token", user: adminUser() }
      }));
    }
    if (requestPath === "/api/auth/me") {
      return Promise.resolve(jsonResponse(200, { data: adminUser() }));
    }
    if (requestPath === "/api/auth/logout") {
      return Promise.resolve(jsonResponse(200, { data: {} }));
    }

    return adminApiResponse(requestPath, options);
  });
}

function createEditorLoginFetch() {
  return vi.fn((requestPath, options = {}) => {
    if (requestPath === "/api/auth/refresh") {
      return Promise.resolve(jsonResponse(401, {
        error: { code: "REFRESH_REQUIRED", message: "Refresh required." }
      }));
    }
    if (requestPath === "/api/auth/login") {
      expect(JSON.parse(options.body)).toEqual({
        email: "editor@example.test",
        password: "secret-password"
      });
      return Promise.resolve(jsonResponse(200, {
        data: { accessToken: "editor-token", user: editorUser() }
      }));
    }
    if (requestPath === "/api/auth/me") {
      return Promise.resolve(jsonResponse(200, { data: editorUser() }));
    }

    return adminApiResponse(requestPath, options);
  });
}

function adminApiResponse(requestPath) {
  if (requestPath.startsWith("/api/admin/categories")) {
    return Promise.resolve(jsonResponse(200, {
      data: [categoryFixture()],
      meta: metaFixture(1)
    }));
  }
  if (requestPath.startsWith(`/api/admin/sites/${siteFixture().id}`)) {
    return Promise.resolve(jsonResponse(200, { data: siteFixture() }));
  }
  if (requestPath.startsWith("/api/admin/sites")) {
    return Promise.resolve(jsonResponse(200, {
      data: [siteFixture()],
      meta: metaFixture(1)
    }));
  }
  if (requestPath.startsWith("/api/admin/users")) {
    return Promise.resolve(jsonResponse(200, {
      data: [userFixture()],
      meta: metaFixture(1)
    }));
  }
  if (requestPath.startsWith("/api/admin/audit-logs")) {
    return Promise.resolve(jsonResponse(200, {
      data: [auditFixture()],
      meta: metaFixture(1)
    }));
  }

  throw new Error(`Unexpected path ${requestPath}`);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

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
    id: "00000000-0000-4000-8000-000000000002",
    role: "editor"
  };
}

function userFixture() {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    email: "long-user-email-admin-operations-team@example.test",
    id: "00000000-0000-4000-8000-000000000003",
    lastLoginAt: "2026-07-28T10:00:00.000Z",
    role: "editor",
    updatedAt: "2026-07-28T10:30:00.000Z"
  };
}

function categoryFixture() {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    description: '<img onerror="category">',
    id: "00000000-0000-4000-8000-000000000101",
    siteCount: 2,
    slug: "long-category-slug-for-admin-flow",
    sortOrder: 1,
    title: "Операционные системы",
    updatedAt: "2026-07-28T10:00:00.000Z"
  };
}

function siteFixture() {
  return {
    active: true,
    category: categoryFixture(),
    categoryId: categoryFixture().id,
    deletedAt: null,
    galleryImages: [
      {
        alt: "Gallery",
        assetId: "00000000-0000-4000-8000-000000000401",
        sortOrder: 1,
        url: "https://storage.example.test/gallery.webp"
      }
    ],
    id: "00000000-0000-4000-8000-000000000301",
    previewImageUrl: null,
    shortDescription: "Короткое описание",
    slug: "private-admin-flow-site",
    status: "draft",
    title: 'Private <img onerror="x">',
    updatedAt: "2026-07-28T10:00:00.000Z",
    views: 12
  };
}

function auditFixture() {
  return {
    action: "site.publish",
    actor: null,
    afterJson: { next: '<img onerror="audit">', payload: { ok: true } },
    beforeJson: { previous: "draft" },
    createdAt: "2026-07-28T10:00:00.000Z",
    entityId: siteFixture().id,
    entityType: "site",
    id: "00000000-0000-4000-8000-000000000501",
    requestId: "req_" + "x".repeat(80)
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
