import { describe, expect, it, vi } from "vitest";

import { visibleNavigation } from "../src/admin/assets/screens/shell.js";
import {
  buildAuditListPath,
  createAuditScreen,
  normalizeAuditFilters
} from "../src/admin/assets/screens/audit.js";
import {
  click,
  createDeferred,
  createFakeDocument,
  setValue,
  submit,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin audit screen", () => {
  it("keeps audit navigation and rendering admin-only", async () => {
    expect(visibleNavigation("editor").map((item) => item.id)).toEqual(["sites", "categories"]);
    expect(visibleNavigation("admin").map((item) => item.id)).toEqual(["sites", "categories", "users", "audit", "maintenance"]);

    const documentRef = createFakeDocument();
    const apiClient = { requestJson: vi.fn() };
    const screen = createAuditScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "editor"
    });

    await screen.load();

    expect(apiClient.requestJson).not.toHaveBeenCalled();
    expect(screen.element.textContent).toContain("Недостаточно прав");
    expect(screen.element.textContent).not.toMatch(/Удалить|Редактировать|Экспорт/);
  });

  it("builds current-contract audit queries with bounded filters", () => {
    const validUuid = "00000000-0000-4000-8000-000000000001";

    expect(buildAuditListPath({})).toBe("/api/admin/audit-logs?sort=newest&page=1&limit=50");
    expect(buildAuditListPath({
      action: ` ${"a".repeat(90)} `,
      actorUserId: validUuid,
      entityId: validUuid,
      entityType: "user",
      from: "2026-07-28T10:00:00.000Z",
      limit: 100,
      page: 3,
      sort: "oldest",
      to: "bad-date",
      unknown: "drop"
    })).toBe(
      `/api/admin/audit-logs?action=${"a".repeat(80)}&actorUserId=${validUuid}&entityId=${validUuid}&entityType=user&from=2026-07-28T10%3A00%3A00.000Z&sort=oldest&page=3&limit=100`
    );
    expect(normalizeAuditFilters({
      action: "  publish  ",
      actorUserId: "not-a-uuid",
      entityId: validUuid,
      entityType: "bad",
      from: "bad-date",
      limit: 500,
      page: 0,
      sort: "bad",
      to: "2026-07-29T10:00:00.000Z"
    })).toEqual({
      action: "publish",
      entityId: validUuid,
      limit: 100,
      page: 1,
      sort: "newest",
      to: "2026-07-29T10:00:00.000Z"
    });
    expect(normalizeAuditFilters({ page: 9, action: "x" }, { filtersChanged: true }).page).toBe(1);
  });

  it("renders audit entries as safe read-only text and copies requestId", async () => {
    const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
    const documentRef = createFakeDocument({ clipboard });
    const apiClient = {
      requestJson: vi.fn(() => Promise.resolve({
        data: [
          auditFixture({
            actor: null,
            afterJson: { next: '<img src=x onerror="boom">', nested: { ok: true } },
            beforeJson: '<script>alert("x")</script>',
            requestId: "req_audit_1"
          })
        ],
        meta: metaFixture(1)
      }))
    };
    const screen = createAuditScreen({
      apiClient,
      clipboard,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();

    expect(apiClient.requestJson).toHaveBeenCalledWith(
      "/api/admin/audit-logs?sort=newest&page=1&limit=50",
      expect.objectContaining({ method: "GET" })
    );
    expect(screen.element.textContent).toContain("Система / CLI");
    expect(screen.element.textContent).toContain("<img src=x onerror=");
    expect(screen.element.textContent).toContain('\\"boom\\">');
    expect(screen.element.textContent).toContain('<script>alert(\\"x\\")</script>');
    expect(screen.element.querySelector("img")).toBeNull();
    expect(screen.element.querySelector("script")).toBeNull();
    expect(screen.element.textContent).not.toMatch(/Удалить|Редактировать|Экспорт/);

    click(screen.element, '[data-action="copy-request-id"]');
    await waitFor(() => clipboard.writeText.mock.calls.length === 1);
    expect(clipboard.writeText).toHaveBeenCalledWith("req_audit_1");
  });

  it("aborts stale requests and renders loading, empty, and error states without polling", async () => {
    const documentRef = createFakeDocument();
    const deferred = createDeferred();
    const responses = [
      deferred.promise,
      Promise.resolve({ data: [auditFixture({ action: "fresh" })], meta: metaFixture(1) }),
      Promise.resolve({ data: [], meta: metaFixture(0) }),
      Promise.reject({ message: "Audit failed.", requestId: "req_audit_error" })
    ];
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        return responses.shift();
      })
    };
    const screen = createAuditScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    const firstLoad = screen.load();
    expect(screen.element.textContent).toContain("Загрузка");
    const secondLoad = screen.load();
    deferred.resolve({ data: [auditFixture({ action: "stale" })], meta: metaFixture(1) });
    await Promise.all([firstLoad, secondLoad]);
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(screen.element.textContent).toContain("fresh");
    expect(screen.element.textContent).not.toContain("stale");

    await screen.load();
    expect(screen.element.textContent).toContain("Записей пока нет");

    await screen.load();
    expect(screen.element.textContent).toContain("Audit failed.");
    expect(screen.element.textContent).toContain("req_audit_error");
    expect(apiClient.requestJson).toHaveBeenCalledTimes(4);
  });

  it("applies filters as read-only GET requests and resets page", async () => {
    const documentRef = createFakeDocument();
    const requests = [];
    const apiClient = {
      requestJson: vi.fn((requestPath, options = {}) => {
        requests.push({ options, requestPath });
        return Promise.resolve({ data: [], meta: metaFixture(0) });
      })
    };
    const screen = createAuditScreen({
      apiClient,
      documentRef,
      onStatus: vi.fn(),
      role: "admin"
    });

    await screen.load();
    setValue(screen.element, "auditAction", "login");
    setValue(screen.element, "auditPage", "4");
    submit(screen.element, '[data-action="filter-audit"]');
    await waitFor(() => requests.length === 2);

    expect(requests[1].requestPath).toContain("/api/admin/audit-logs?action=login");
    expect(requests[1].requestPath).toContain("page=1");
    expect(requests[1].options.method).toBe("GET");
    expect(requests[1].options.body).toBeUndefined();
    expect(screen.element.textContent).not.toMatch(/Удалить|Редактировать|Экспорт/);
  });
});

function auditFixture(overrides = {}) {
  return {
    action: "site.publish",
    actor: {
      email: "admin@example.test",
      id: "00000000-0000-4000-8000-000000000001",
      role: "admin"
    },
    afterJson: { status: "published" },
    beforeJson: { status: "draft" },
    createdAt: "2026-07-28T10:00:00.000Z",
    entityId: "00000000-0000-4000-8000-000000000101",
    entityType: "site",
    id: "00000000-0000-4000-8000-000000000201",
    requestId: "req_audit",
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
