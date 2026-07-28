import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";
import { FormValidationError } from "../forms.js";

const QUERY_ORDER = ["search", "role", "active", "sort", "direction", "page", "limit"];
const USER_SORT_VALUES = new Set(["createdAt", "updatedAt", "email", "role", "lastLoginAt"]);
const USER_ROLE_VALUES = new Set(["admin", "editor"]);
const USER_DIRECTION_VALUES = new Set(["asc", "desc"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createUsersScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const currentUser = normalizeCurrentUser(options?.currentUser);
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  let activeController = null;
  let currentDialog = null;
  let destroyed = false;
  let filters = normalizeUsersFilters({});
  let mutationBusy = false;
  let users = [];

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const results = createElement("section", {
    documentRef,
    className: "admin-user-results",
    attributes: {
      "aria-live": "polite"
    }
  });
  const detailHost = createElement("section", {
    documentRef,
    className: "admin-user-detail",
    attributes: {
      "aria-live": "polite"
    }
  });
  const dialogHost = createElement("section", {
    documentRef,
    className: "admin-dialog-host"
  });
  const filterForm = createFilterForm({
    documentRef,
    filters,
    onApply(nextFilters) {
      filters = normalizeUsersFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
      void load();
    },
    onReset() {
      filters = normalizeUsersFilters({});
      void load();
    }
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-users-screen",
    children: [
      createElement("div", {
        documentRef,
        className: "admin-screen-heading",
        children: [
          createElement("div", {
            documentRef,
            children: [
              createElement("p", {
                documentRef,
                className: "admin-kicker",
                text: "Доступ"
              }),
              createElement("h2", {
                documentRef,
                text: "Пользователи"
              })
            ]
          })
        ]
      }),
      ...(role === "admin" ? [filterForm] : []),
      statusRegion,
      results,
      detailHost,
      dialogHost
    ]
  });

  async function load() {
    if (role !== "admin") {
      renderForbidden(results, documentRef);
      replaceContent(detailHost);
      statusRegion.textContent = "Недостаточно прав.";
      onStatus("Недостаточно прав.");
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading(results, documentRef);
    replaceContent(detailHost);

    try {
      const response = await apiClient.requestJson(buildUsersListPath(filters), {
        method: "GET",
        signal: controller.signal
      });

      if (controller.signal.aborted || destroyed) {
        return;
      }

      users = Array.isArray(response?.data) ? response.data : [];
      renderUsers({
        currentUser,
        documentRef,
        filters,
        onAction: openUserActionDialog,
        onDetail: loadUserDetail,
        results,
        role,
        users,
        meta: response?.meta ?? null
      });
      statusRegion.textContent = "Список пользователей обновлён.";
      onStatus("Список пользователей обновлён.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(results, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить пользователей.";
      onStatus("Не удалось загрузить пользователей.");
    }
  }

  function destroy() {
    destroyed = true;
    abortActiveRequest();
    currentDialog?.destroy();
    currentDialog = null;
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
  }

  async function loadUserDetail(user) {
    if (role !== "admin") {
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    replaceContent(detailHost, createElement("p", {
      documentRef,
      text: "Загрузка пользователя..."
    }));

    try {
      const response = await apiClient.requestJson(userPath(validateUuid(user.id, "user")), {
        method: "GET",
        signal: controller.signal
      });

      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderUserDetail(detailHost, documentRef, response?.data ?? null);
      statusRegion.textContent = "Карточка пользователя загружена.";
      onStatus("Карточка пользователя загружена.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(detailHost, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить пользователя.";
      onStatus("Не удалось загрузить пользователя.");
    }
  }

  function openUserActionDialog(user, actionId, invoker, nextRole) {
    const action = getUserAction(actionId);
    if (action === null || !getAvailableUserActions(user, role, currentUser).some((item) => item.id === actionId)) {
      return;
    }

    const rolePayload = actionId === "change-role" ? buildUserRolePayload(nextRole) : null;
    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmLabel: action.confirmLabel,
      description: `${action.description} Пользователь: ${safeUserEmail(user)}.`,
      destructive: action.destructive === true,
      documentRef,
      onConfirm: async () => {
        await runUserMutation(user, actionId, rolePayload);
      },
      title: action.confirmLabel
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  async function runUserMutation(user, actionId, rolePayload) {
    const userId = validateUuid(user.id, "user");
    const request = mutationRequest(userId, actionId, rolePayload);
    mutationBusy = true;

    try {
      await apiClient.requestJson(request.path, request.options);

      if (destroyed) {
        return;
      }

      statusRegion.textContent = request.success;
      onStatus(request.success);
      await load();
    } finally {
      mutationBusy = false;
    }
  }

  return {
    destroy,
    element,
    isMutationBusy() {
      return mutationBusy;
    },
    load,
    setFilters(nextFilters) {
      filters = normalizeUsersFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
    }
  };
}

export function normalizeUsersFilters(rawFilters, options = {}) {
  const source = toRecord(rawFilters);
  const normalized = {
    direction: USER_DIRECTION_VALUES.has(source.direction) ? source.direction : "desc",
    limit: parseBoundedInteger(source.limit, 50, { max: 100, min: 1 }),
    page: options.filtersChanged === true ? 1 : parseBoundedInteger(source.page, 1, { min: 1 }),
    sort: USER_SORT_VALUES.has(source.sort) ? source.sort : "createdAt"
  };
  const search = normalizeText(source.search, 100);
  const nextRole = USER_ROLE_VALUES.has(source.role) ? source.role : undefined;
  const active = parseOptionalBoolean(source.active);

  if (search !== undefined) {
    normalized.search = search;
  }
  if (nextRole !== undefined) {
    normalized.role = nextRole;
  }
  if (active !== undefined) {
    normalized.active = active;
  }

  return normalized;
}

export function buildUsersListPath(rawFilters) {
  const filters = normalizeUsersFilters(rawFilters);
  const params = new URLSearchParams();

  for (const key of QUERY_ORDER) {
    const value = filters[key];
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  return `/api/admin/users?${params.toString()}`;
}

export function buildUserRolePayload(role) {
  if (!USER_ROLE_VALUES.has(role)) {
    throw validationError("role", "Must be admin or editor.");
  }

  return { role };
}

export function getAvailableUserActions(user, role, currentUser) {
  if (role !== "admin" || typeof user !== "object" || user === null) {
    return [];
  }

  const actions = [{ id: "change-role", label: "Изменить роль" }];
  const isSelf = typeof currentUser?.id === "string" && currentUser.id === user.id;

  if (!isSelf) {
    actions.push(user.active === false
      ? { id: "enable", label: "Включить" }
      : { id: "disable", label: "Отключить" });
  }

  return actions;
}

function createFilterForm({ documentRef, filters, onApply, onReset }) {
  const searchInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      name: "userSearch",
      placeholder: "Поиск",
      type: "search",
      value: filters.search ?? ""
    }
  });
  const roleSelect = createSelect(documentRef, "userRoleFilter", [
    ["", "Любая роль"],
    ["admin", "Администратор"],
    ["editor", "Редактор"]
  ], filters.role ?? "");
  const activeSelect = createSelect(documentRef, "userActive", [
    ["", "Любая активность"],
    ["true", "Активные"],
    ["false", "Отключённые"]
  ], filters.active === undefined ? "" : String(filters.active));
  const sortSelect = createSelect(documentRef, "userSort", [
    ["createdAt", "Создан"],
    ["updatedAt", "Обновлён"],
    ["email", "Email"],
    ["role", "Роль"],
    ["lastLoginAt", "Последний вход"]
  ], filters.sort);
  const directionSelect = createSelect(documentRef, "userDirection", [
    ["desc", "По убыванию"],
    ["asc", "По возрастанию"]
  ], filters.direction);
  const pageInput = createElement("input", {
    documentRef,
    attributes: {
      min: "1",
      name: "userPage",
      type: "number",
      value: String(filters.page)
    }
  });
  const limitInput = createElement("input", {
    documentRef,
    attributes: {
      max: "100",
      min: "1",
      name: "userLimit",
      type: "number",
      value: String(filters.limit)
    }
  });

  return createElement("form", {
    documentRef,
    className: "admin-filter-form admin-user-filters",
    attributes: {
      "data-action": "filter-users"
    },
    children: [
      labeled(documentRef, "Поиск", searchInput),
      labeled(documentRef, "Роль", roleSelect),
      labeled(documentRef, "Активность", activeSelect),
      labeled(documentRef, "Сортировка", sortSelect),
      labeled(documentRef, "Направление", directionSelect),
      labeled(documentRef, "Страница", pageInput),
      labeled(documentRef, "Лимит", limitInput),
      createElement("button", {
        documentRef,
        text: "Применить",
        attributes: {
          type: "submit"
        }
      }),
      createElement("button", {
        documentRef,
        text: "Сбросить",
        attributes: {
          type: "button"
        },
        on: {
          click: () => {
            searchInput.value = "";
            roleSelect.value = "";
            activeSelect.value = "";
            sortSelect.value = "createdAt";
            directionSelect.value = "desc";
            pageInput.value = "1";
            limitInput.value = "50";
            onReset();
          }
        }
      })
    ],
    on: {
      submit: (event) => {
        event.preventDefault();
        onApply({
          active: activeSelect.value,
          direction: directionSelect.value,
          limit: limitInput.value,
          page: pageInput.value,
          role: roleSelect.value,
          search: searchInput.value,
          sort: sortSelect.value
        });
      }
    }
  });
}

function renderUsers({ currentUser, documentRef, filters, onAction, onDetail, results, role, users, meta }) {
  if (users.length === 0) {
    const filtered = filters.search !== undefined || filters.role !== undefined || filters.active !== undefined;
    replaceContent(results, createElement("p", {
      documentRef,
      text: filtered ? "Ничего не найдено." : "Пользователей пока нет."
    }));
    return;
  }

  const table = createElement("table", {
    documentRef,
    className: "admin-data-table admin-user-table",
    children: [
      createElement("thead", {
        documentRef,
        children: [
          createElement("tr", {
            documentRef,
            children: [
              createElement("th", { documentRef, text: "Email", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "ID", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Роль", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Активность", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Последний вход", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Created", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Updated", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Действия", attributes: { scope: "col" } })
            ]
          })
        ]
      }),
      createElement("tbody", {
        documentRef,
        children: users.map((user) => renderUserRow({
          currentUser,
          documentRef,
          onAction,
          onDetail,
          role,
          user
        }))
      })
    ]
  });
  const pagination = createElement("p", {
    documentRef,
    className: "admin-pagination-note",
    text: paginationText(meta)
  });

  replaceContent(results, table, pagination);
}

function renderUserRow({ currentUser, documentRef, onAction, onDetail, role, user }) {
  const actions = getAvailableUserActions(user, role, currentUser);
  const actionControls = [
    createElement("button", {
      documentRef,
      text: "Открыть",
      attributes: {
        "data-action": "view-user",
        type: "button"
      },
      on: {
        click: () => {
          void onDetail(user);
        }
      }
    })
  ];

  if (actions.some((action) => action.id === "change-role")) {
    const roleSelect = createSelect(documentRef, "targetUserRole", [
      ["admin", "Администратор"],
      ["editor", "Редактор"]
    ], user.role === "admin" ? "editor" : "admin");
    actionControls.push(createElement("form", {
      documentRef,
      className: "admin-inline-form",
      attributes: {
        "data-action": "change-user-role"
      },
      children: [
        roleSelect,
        createElement("button", {
          documentRef,
          text: "Изменить роль",
          attributes: {
            type: "submit"
          }
        })
      ],
      on: {
        submit: (event) => {
          event.preventDefault();
          onAction(user, "change-role", event.target, roleSelect.value);
        }
      }
    }));
  }

  if (actions.some((action) => action.id === "disable")) {
    actionControls.push(createElement("button", {
      documentRef,
      text: "Отключить",
      attributes: {
        "data-action": "disable-user",
        type: "button"
      },
      on: {
        click: (event) => onAction(user, "disable", event.target)
      }
    }));
  }

  if (actions.some((action) => action.id === "enable")) {
    actionControls.push(createElement("button", {
      documentRef,
      text: "Включить",
      attributes: {
        "data-action": "enable-user",
        type: "button"
      },
      on: {
        click: (event) => onAction(user, "enable", event.target)
      }
    }));
  }

  return createElement("tr", {
    documentRef,
    children: [
      createElement("td", { documentRef, text: user.email ?? "" }),
      createElement("td", { documentRef, text: user.id ?? "" }),
      createElement("td", {
        documentRef,
        children: [
          createElement("span", {
            documentRef,
            className: `admin-badge ${user.role === "admin" ? "is-admin" : "is-editor"}`,
            text: roleLabel(user.role)
          })
        ]
      }),
      createElement("td", {
        documentRef,
        children: [
          createElement("span", {
            documentRef,
            className: `admin-badge ${user.active === false ? "is-muted" : "is-active"}`,
            text: user.active === false ? "Отключён" : "Активен"
          })
        ]
      }),
      createElement("td", { documentRef, text: user.lastLoginAt ?? "" }),
      createElement("td", { documentRef, text: user.createdAt ?? "" }),
      createElement("td", { documentRef, text: user.updatedAt ?? "" }),
      createElement("td", {
        documentRef,
        children: [
          createElement("div", {
            documentRef,
            className: "admin-row-actions admin-user-actions",
            children: actionControls
          })
        ]
      })
    ]
  });
}

function renderUserDetail(detailHost, documentRef, user) {
  const safeUser = toRecord(user);

  replaceContent(detailHost, createElement("section", {
    documentRef,
    className: "admin-detail-panel",
    children: [
      createElement("h3", {
        documentRef,
        text: "Детали пользователя"
      }),
      createElement("p", { documentRef, text: `ID: ${safeUser.id ?? ""}` }),
      createElement("p", { documentRef, text: `Email: ${safeUser.email ?? ""}` }),
      createElement("p", { documentRef, text: `Роль: ${roleLabel(safeUser.role)}` }),
      createElement("p", { documentRef, text: `Активность: ${safeUser.active === false ? "Отключён" : "Активен"}` }),
      createElement("p", { documentRef, text: `Последний вход: ${safeUser.lastLoginAt ?? ""}` }),
      createElement("p", { documentRef, text: `Created: ${safeUser.createdAt ?? ""}` }),
      createElement("p", { documentRef, text: `Updated: ${safeUser.updatedAt ?? ""}` })
    ]
  }));
}

function renderLoading(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Загрузка пользователей..."
  }));
}

function renderForbidden(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Недостаточно прав для просмотра пользователей."
  }));
}

function renderError(container, documentRef, error) {
  const children = [
    createElement("p", {
      documentRef,
      text: safeMessage(error)
    })
  ];
  const requestId = safeRequestId(error);

  if (requestId !== null) {
    children.push(createRequestIdControl(requestId, { documentRef }));
  }

  replaceContent(container, ...children);
}

function mutationRequest(userId, actionId, rolePayload) {
  if (actionId === "change-role") {
    return {
      options: {
        body: rolePayload,
        method: "PATCH"
      },
      path: `${userPath(userId)}/role`,
      success: "Роль пользователя обновлена."
    };
  }
  if (actionId === "disable") {
    return {
      options: {
        method: "POST"
      },
      path: `${userPath(userId)}/disable`,
      success: "Пользователь отключён."
    };
  }
  if (actionId === "enable") {
    return {
      options: {
        method: "POST"
      },
      path: `${userPath(userId)}/enable`,
      success: "Пользователь включён."
    };
  }

  throw validationError("action", "Unsupported user action.");
}

function getUserAction(actionId) {
  if (actionId === "change-role") {
    return {
      confirmLabel: "Изменить роль",
      description: "Роль изменится только после подтверждения сервером."
    };
  }
  if (actionId === "disable") {
    return {
      confirmLabel: "Отключить",
      description: "Доступ пользователя будет отключён после подтверждения сервером.",
      destructive: true
    };
  }
  if (actionId === "enable") {
    return {
      confirmLabel: "Включить",
      description: "Доступ пользователя будет включён после подтверждения сервером."
    };
  }

  return null;
}

function userPath(userId) {
  return `/api/admin/users/${encodeURIComponent(userId)}`;
}

function validateUuid(value, label) {
  const text = String(value ?? "");

  if (!UUID_PATTERN.test(text)) {
    throw validationError(label, "Must be a valid UUID.");
  }

  return text;
}

function createSelect(documentRef, name, options, selectedValue) {
  const select = createElement("select", {
    documentRef,
    attributes: {
      name
    },
    children: options.map(([value, label]) => createElement("option", {
      documentRef,
      text: label,
      attributes: {
        selected: value === selectedValue,
        value
      }
    }))
  });
  select.value = selectedValue;

  return select;
}

function labeled(documentRef, label, control) {
  return createElement("label", {
    documentRef,
    className: "admin-field",
    children: [
      createElement("span", {
        documentRef,
        text: label
      }),
      control
    ]
  });
}

function normalizeCurrentUser(input) {
  if (typeof input === "object" && input !== null) {
    return {
      email: typeof input.email === "string" ? input.email : "",
      id: typeof input.id === "string" ? input.id : "",
      role: USER_ROLE_VALUES.has(input.role) ? input.role : "editor"
    };
  }

  return null;
}

function roleLabel(role) {
  return role === "admin" ? "Администратор" : "Редактор";
}

function safeUserEmail(user) {
  return typeof user?.email === "string" && user.email.length > 0 ? user.email : String(user?.id ?? "user");
}

function paginationText(meta) {
  if (typeof meta?.page === "number" && typeof meta?.totalPages === "number") {
    return `Страница ${meta.page} из ${meta.totalPages}. Всего: ${meta.total ?? 0}.`;
  }

  return "";
}

function parseBoundedInteger(value, defaultValue, options) {
  const text = String(value ?? "").trim();
  if (text.length === 0 || !/^\d+$/.test(text)) {
    return defaultValue;
  }

  const parsed = Number.parseInt(text, 10);
  const min = options.min;
  const max = options.max ?? parsed;

  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }

  return undefined;
}

function normalizeText(value, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    return undefined;
  }

  return text.slice(0, maxLength);
}

function validationError(path, message) {
  return new FormValidationError([{ message, path }]);
}

function safeMessage(error) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Не удалось выполнить действие.";
}

function safeRequestId(error) {
  return typeof error?.requestId === "string" && error.requestId.length > 0
    ? error.requestId
    : null;
}

function toRecord(input) {
  return typeof input === "object" && input !== null ? input : {};
}
