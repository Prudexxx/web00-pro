import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createConfirmationDialog } from "../src/admin/assets/dialog.js";
import { createLoginView } from "../src/admin/assets/screens/login.js";
import { createAuthenticatedShell } from "../src/admin/assets/screens/shell.js";
import { createSitesListScreen } from "../src/admin/assets/screens/sites-list.js";
import { createSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";
import { createImageManagerScreen } from "../src/admin/assets/screens/image-manager.js";
import { createCategoriesScreen } from "../src/admin/assets/screens/categories.js";
import { createUsersScreen } from "../src/admin/assets/screens/users.js";
import {
  click,
  createFakeDocument,
  submit,
  waitFor
} from "./helpers/admin-ui-wave5-dom.mjs";

describe("admin UI accessibility contract", () => {
  it("labels visible form controls and gives every button an explicit type", async () => {
    const screens = await renderRepresentativeScreens();

    for (const screen of screens) {
      for (const control of controls(screen.element)) {
        expect(hasLabel(control), `${screen.name} missing label for ${control.getAttribute("name")}`).toBe(true);
      }
      for (const button of screen.element.querySelectorAll("button")) {
        expect(button.getAttribute("type"), `${screen.name} button without type`).toMatch(/^(button|submit|reset)$/);
      }
    }
  });

  it("keeps navigation, IDs, aria-current, live regions, focus target, and noscript accessible", () => {
    const documentRef = createFakeDocument();
    const shell = createAuthenticatedShell({
      documentRef,
      onLogout: vi.fn(),
      onNavigate: () => true,
      user: adminUser()
    });
    const css = readFileSync("src/admin/assets/admin.css", "utf8");
    const html = readFileSync("src/admin/index.html", "utf8");

    shell.showContent("Категории", documentRef.createElement("section"));

    expect(shell.querySelector("nav").getAttribute("aria-label")).toBe("Разделы панели");
    expect(shell.querySelector('[data-section="sites"]').getAttribute("aria-current")).toBe("page");
    expect(shell.querySelector(".admin-shell-status").getAttribute("aria-live")).toBe("polite");
    expect(shell.querySelector("h2").getAttribute("tabindex")).toBe("-1");
    expect(shell.querySelector("h2").focused).toBe(true);
    expect(uniqueIds(shell)).toBe(true);
    expect(hasPositiveTabindex(shell)).toBe(false);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(html).toContain("<noscript>");
    expect(html).not.toMatch(/autofocus/i);
  });

  it("links field errors to inputs with alert semantics and restores destructive dialog focus", async () => {
    const documentRef = createFakeDocument();
    const editor = createSiteEditorScreen({
      apiClient: {
        requestJson: vi.fn(() => Promise.resolve({ data: [categoryFixture()] }))
      },
      documentRef,
      mode: "create",
      onCancel: vi.fn(),
      onImages: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "admin"
    });
    await editor.load();
    submit(editor.element, "form");
    await waitFor(() => editor.element.textContent.includes("required"));

    const title = editor.element.querySelector('[name="title"]');
    const titleErrorId = title.getAttribute("aria-describedby");
    expect(titleErrorId).toMatch(/^admin-field-error-/);
    const titleError = findById(editor.element, titleErrorId);
    expect(titleError.getAttribute("role")).toBe("alert");

    const invoker = documentRef.createElement("button");
    invoker.setAttribute("type", "button");
    const dialog = createConfirmationDialog({
      destructive: true,
      documentRef,
      onConfirm: vi.fn(),
      title: "Удалить запись",
      description: "Подтвердите удаление."
    });

    dialog.open(invoker);
    expect(dialog.element.getAttribute("role")).toBe("dialog");
    expect(dialog.element.getAttribute("aria-labelledby")).not.toBeNull();
    expect(dialog.element.getAttribute("aria-describedby")).not.toBeNull();
    click(dialog.element, '[data-action="cancel-dialog"]');
    expect(invoker.focused).toBe(true);
  });

  it("preserves table headers as mobile card labels", async () => {
    const [sites, categories, users] = await renderTableScreens();

    for (const screen of [sites, categories, users]) {
      expect(screen.element.querySelector("th")).not.toBeNull();
      for (const cell of screen.element.querySelectorAll("td")) {
        expect(cell.getAttribute("data-label"), `${screen.name} missing mobile label`).toMatch(/\S/);
      }
    }
  });
});

async function renderRepresentativeScreens() {
  const documentRef = createFakeDocument();
  const login = createLoginView({ documentRef, onSubmit: vi.fn() });
  const editor = createSiteEditorScreen({
    apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [categoryFixture()] })) },
    documentRef,
    mode: "create",
    onCancel: vi.fn(),
    onImages: vi.fn(),
    onSaved: vi.fn(),
    onStatus: vi.fn(),
    role: "admin"
  });
  await editor.load();
  const imageManager = createImageManagerScreen({
    apiClient: {
      requestJson: vi.fn(() => Promise.resolve({ data: siteFixture() })),
      requestMultipart: vi.fn()
    },
    documentRef,
    onBack: vi.fn(),
    onSiteUpdated: vi.fn(),
    onStatus: vi.fn(),
    role: "admin",
    siteId: siteFixture().id
  });
  await imageManager.load();

  return [
    { element: login, name: "login" },
    { element: editor.element, name: "site editor" },
    { element: imageManager.element, name: "image manager" }
  ];
}

async function renderTableScreens() {
  const documentRef = createFakeDocument();
  const sites = createSitesListScreen({
    apiClient: {
      requestJson: vi.fn((requestPath) => {
        if (requestPath.startsWith("/api/admin/categories")) {
          return Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) });
        }
        return Promise.resolve({ data: [siteFixture()], meta: metaFixture(1) });
      })
    },
    documentRef,
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onImages: vi.fn(),
    onStatus: vi.fn(),
    role: "admin"
  });
  const categories = createCategoriesScreen({
    apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [categoryFixture()], meta: metaFixture(1) })) },
    documentRef,
    onStatus: vi.fn(),
    role: "admin"
  });
  const users = createUsersScreen({
    apiClient: { requestJson: vi.fn(() => Promise.resolve({ data: [userFixture()], meta: metaFixture(1) })) },
    currentUser: adminUser(),
    documentRef,
    onStatus: vi.fn(),
    role: "admin"
  });

  await sites.load();
  await categories.load();
  await users.load();

  return [
    { element: sites.element, name: "sites" },
    { element: categories.element, name: "categories" },
    { element: users.element, name: "users" }
  ];
}

function controls(root) {
  return [
    ...root.querySelectorAll("input"),
    ...root.querySelectorAll("select"),
    ...root.querySelectorAll("textarea")
  ].filter((control) => control.getAttribute("type") !== "hidden");
}

function hasLabel(control) {
  let current = control.parentNode;
  while (current !== null && current !== undefined) {
    if (current.tagName === "label") {
      return true;
    }
    current = current.parentNode;
  }

  const id = control.getAttribute("id");
  if (id === null) {
    return false;
  }

  return rootOf(control).querySelector(`label[for="${id}"]`) !== null;
}

function uniqueIds(root) {
  const ids = allElements(root)
    .map((node) => node.getAttribute("id"))
    .filter((value) => value !== null);
  return ids.length === new Set(ids).size;
}

function hasPositiveTabindex(root) {
  return allElements(root).some((node) => Number(node.getAttribute("tabindex") ?? 0) > 0);
}

function findById(root, id) {
  const found = allElements(root).find((node) => node.getAttribute("id") === id);
  if (found === undefined) {
    throw new Error(`Missing id ${id}`);
  }
  return found;
}

function allElements(root) {
  const nodes = [];
  walk(root, (node) => {
    if (typeof node.getAttribute === "function") {
      nodes.push(node);
    }
  });
  return nodes;
}

function rootOf(node) {
  let current = node;
  while (current.parentNode !== null && current.parentNode !== undefined) {
    current = current.parentNode;
  }
  return current;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

function adminUser() {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin"
  };
}

function categoryFixture() {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    description: "Категория",
    id: "00000000-0000-4000-8000-000000000101",
    siteCount: 2,
    slug: "crm",
    sortOrder: 1,
    title: "CRM",
    updatedAt: "2026-07-28T10:00:00.000Z"
  };
}

function siteFixture() {
  return {
    active: true,
    category: categoryFixture(),
    categoryId: categoryFixture().id,
    deletedAt: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000301",
    previewImageUrl: null,
    shortDescription: "Коротко",
    slug: "crm-site",
    status: "draft",
    title: "CRM Site",
    updatedAt: "2026-07-28T10:00:00.000Z",
    views: 4
  };
}

function userFixture() {
  return {
    active: true,
    createdAt: "2026-07-27T10:00:00.000Z",
    email: "editor@example.test",
    id: "00000000-0000-4000-8000-000000000003",
    lastLoginAt: "2026-07-28T10:00:00.000Z",
    role: "editor",
    updatedAt: "2026-07-28T10:30:00.000Z"
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
