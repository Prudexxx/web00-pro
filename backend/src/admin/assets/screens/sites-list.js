import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";

const QUERY_ORDER = [
  "search",
  "status",
  "category",
  "active",
  "featured",
  "deleted",
  "sort",
  "direction",
  "page",
  "limit"
];

const STATUS_VALUES = new Set(["draft", "published", "archived"]);
const DELETED_VALUES = new Set(["without", "with", "only"]);
const SORT_VALUES = new Set(["updatedAt", "createdAt", "title", "sortOrder"]);
const DIRECTION_VALUES = new Set(["asc", "desc"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_CATALOG_STATUS_PATH = "/api/admin/public-catalog/status";
const CATALOG_STATUS_POLL_INTERVAL_MS = 1500;
const CATALOG_STATUS_MAX_ATTEMPTS = 20;
const LIFECYCLE_ACTIONS = {
  publish: {
    confirmLabel: "Опубликовать",
    description: "Сайт станет доступен публичному каталогу после подтверждения сервером.",
    label: "Опубликовать",
    method: "POST",
    path: (siteId) => `/api/admin/sites/${siteId}/publish`,
    success: "Сайт опубликован."
  },
  unpublish: {
    confirmLabel: "Снять с публикации",
    description: "Сайт вернётся в черновик после подтверждения сервером.",
    label: "Снять с публикации",
    method: "POST",
    path: (siteId) => `/api/admin/sites/${siteId}/unpublish`,
    success: "Сайт снят с публикации."
  },
  "soft-delete": {
    confirmLabel: "Удалить",
    description: "Сайт будет скрыт как удалённый после подтверждения сервером.",
    destructive: true,
    label: "Удалить",
    method: "DELETE",
    path: (siteId) => `/api/admin/sites/${siteId}`,
    success: "Сайт удалён."
  },
  restore: {
    confirmLabel: "Восстановить",
    description: "Сайт вернётся из удалённых после подтверждения сервером.",
    label: "Восстановить",
    method: "POST",
    path: (siteId) => `/api/admin/sites/${siteId}/restore`,
    success: "Сайт восстановлен."
  },
  "permanent-delete": {
    confirmLabel: "Удалить навсегда",
    description: "Окончательное удаление нельзя отменить. Запрос отправляется без тела.",
    destructive: true,
    label: "Удалить навсегда",
    method: "DELETE",
    path: (siteId) => `/api/admin/sites/${siteId}/permanent`,
    success: "Сайт удалён навсегда."
  }
};
const LIFECYCLE_ERROR_MESSAGES = Object.freeze({
  SITE_NOT_DRAFT: "Опубликовать можно только черновик.",
  SITE_NOT_PUBLISHED: "Снять с публикации можно только опубликованную карточку.",
  SITE_IMAGES_ATTACHED: "Перед окончательным удалением удалите preview и gallery.",
  SITE_PREVIEW_REQUIRED: "Перед публикацией добавьте preview-изображение."
});

export function createSitesListScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const onCreate = typeof options?.onCreate === "function" ? options.onCreate : () => {};
  const onEdit = typeof options?.onEdit === "function" ? options.onEdit : () => {};
  const onImages = typeof options?.onImages === "function" ? options.onImages : () => {};
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  const catalogStatusPollIntervalMs = Number.isFinite(options?.pollIntervalMs)
    ? Math.max(0, options.pollIntervalMs)
    : CATALOG_STATUS_POLL_INTERVAL_MS;
  let activeController = null;
  let catalogStatusController = null;
  let categories = [];
  let currentDialog = null;
  let filters = {};
  let destroyed = false;

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const results = createElement("section", {
    documentRef,
    className: "admin-sites-results",
    attributes: {
      "aria-live": "polite"
    }
  });
  const dialogHost = createElement("section", {
    documentRef,
    className: "admin-dialog-host"
  });
  const form = createFilterForm({
    documentRef,
    role,
    onApply(nextFilters) {
      filters = normalizeSitesListFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
      void load();
    },
    onReset() {
      filters = {};
      void load();
    }
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-sites-screen",
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
                text: "Каталог"
              }),
              createElement("h2", {
                documentRef,
                text: "Сайты"
              })
            ]
          }),
          createElement("button", {
            documentRef,
            text: "Создать черновик",
            attributes: {
              "data-action": "create-site",
              type: "button"
            },
            on: {
              click: onCreate
            }
          })
        ]
      }),
      form,
      statusRegion,
      results,
      dialogHost
    ]
  });

  async function load() {
    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading(results, documentRef);

    try {
      const [categoryResponse, siteResponse] = await Promise.all([
        apiClient.requestJson("/api/admin/categories?limit=100&page=1", {
          method: "GET",
          signal: controller.signal
        }),
        apiClient.requestJson(buildSitesListPath(filters), {
          method: "GET",
          signal: controller.signal
        })
      ]);

      if (controller.signal.aborted || destroyed) {
        return;
      }

      categories = Array.isArray(categoryResponse?.data) ? categoryResponse.data : [];
      updateCategoryOptions(form, categories, documentRef);
      renderSites({
        documentRef,
        filters,
        onImages,
        onEdit,
        onLifecycleAction: openLifecycleDialog,
        results,
        role,
        sites: Array.isArray(siteResponse?.data) ? siteResponse.data : [],
        meta: siteResponse?.meta ?? null
      });
      statusRegion.textContent = "Список сайтов обновлён.";
      onStatus("Список сайтов обновлён.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(results, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить список сайтов.";
      onStatus("Не удалось загрузить список сайтов.");
    }
  }

  function destroy() {
    destroyed = true;
    abortActiveRequest();
    abortCatalogStatusRequest();
    currentDialog?.destroy();
    currentDialog = null;
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
  }

  function abortCatalogStatusRequest() {
    catalogStatusController?.abort();
    catalogStatusController = null;
  }

  function openLifecycleDialog(site, actionId, invoker) {
    const action = LIFECYCLE_ACTIONS[actionId];
    if (action === undefined || !getAvailableLifecycleActions(site, role).some((item) => item.id === actionId)) {
      return;
    }

    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmationText: actionId === "permanent-delete" ? confirmationPhrase(site) : undefined,
      confirmLabel: action.confirmLabel,
      description: `${action.description} Сайт: ${visibleSiteName(site)}.`,
      destructive: action.destructive === true,
      documentRef,
      onConfirm: async () => {
        await runLifecycleMutation(site, actionId);
      },
      title: action.confirmLabel
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  async function runLifecycleMutation(site, actionId) {
    const action = LIFECYCLE_ACTIONS[actionId];

    try {
      await applyLifecycleMutation(site, actionId, action);
      if (destroyed) {
        return;
      }

      const catalogMessage = actionId === "permanent-delete"
        ? action.success
        : await observePublicCatalogAfterLifecycle();
      if (destroyed) {
        return;
      }
      await load();
      if (!destroyed) {
        const message = catalogMessage ?? action.success;
        statusRegion.textContent = message;
        onStatus(message);
      }
    } catch (error) {
      if (!destroyed) {
        const message = lifecycleErrorMessage(error);
        if (error?.code === "SITE_IMAGES_ATTACHED") {
          renderImageCleanupDeleteBlock(site, error, message);
        } else {
          statusRegion.textContent = message;
        }
        onStatus(message);
      }

      throw dialogError(error);
    }
  }

  async function applyLifecycleMutation(site, actionId, action) {
    try {
      await apiClient.requestJson(action.path(validateUuid(site.id, "site")), {
        allowNoContent: actionId === "permanent-delete",
        method: action.method
      });
    } catch (error) {
      if (!isUncertainLifecycleError(error)) {
        throw error;
      }

      const verified = await readLifecycleSite(site);
      if (!hasLifecycleTargetState(verified, actionId)) {
        throw error;
      }
    }
  }

  async function readLifecycleSite(site) {
    const response = await apiClient.requestJson(`/api/admin/sites/${validateUuid(site.id, "site")}`, {
      method: "GET"
    });
    const data = response?.data ?? response;

    if (typeof data !== "object" || data === null || data.id !== site.id) {
      throw new Error("Invalid site response.");
    }

    return data;
  }

  async function observePublicCatalogAfterLifecycle() {
    for (let attempt = 0; attempt < CATALOG_STATUS_MAX_ATTEMPTS; attempt += 1) {
      if (destroyed) {
        return null;
      }
      if (attempt > 0) {
        await wait(catalogStatusPollIntervalMs);
      }
      if (destroyed) {
        return null;
      }

      try {
        abortCatalogStatusRequest();
        catalogStatusController = new AbortController();
        const response = await apiClient.requestJson(PUBLIC_CATALOG_STATUS_PATH, {
          method: "GET",
          signal: catalogStatusController.signal
        });
        const catalogStatus = readPublicCatalogStatus(response);

        if (isPublicCatalogReady(catalogStatus)) {
          return null;
        }
        if (catalogStatus.syncStatus === "failed") {
          return "Изменение сохранено, но каталог не опубликован.";
        }
      } catch (error) {
        if (!isUncertainLifecycleError(error)) {
          return "Изменение сохранено, но каталог не опубликован.";
        }
      }
    }

    return "Изменение сохранено. Каталог продолжает обновляться.";
  }

  function readPublicCatalogStatus(response) {
    const statusData = response?.data?.status && typeof response.data.status === "object"
      ? response.data.status
      : response?.data;
    const syncStatus = statusData?.syncStatus;
    const desiredRevision = statusData?.desiredRevision;
    const publishedRevision = statusData?.publishedRevision;

    if (
      isPublicCatalogSyncStatus(syncStatus) &&
      isNonNegativeInteger(desiredRevision) &&
      isNonNegativeInteger(publishedRevision) &&
      publishedRevision <= desiredRevision
    ) {
      return {
        desiredRevision,
        publishedRevision,
        syncStatus
      };
    }

    throw new Error("Invalid public catalog status response.");
  }

  function isPublicCatalogSyncStatus(syncStatus) {
    return syncStatus === "pending" ||
      syncStatus === "syncing" ||
      syncStatus === "ready" ||
      syncStatus === "failed";
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isPublicCatalogReady(catalogStatus) {
    return catalogStatus.syncStatus === "ready" &&
      catalogStatus.desiredRevision === catalogStatus.publishedRevision;
  }

  function hasLifecycleTargetState(site, actionId) {
    if (actionId === "publish") {
      return site?.status === "published" &&
        hasPublishedTimestamp(site) &&
        !isDeletedSite(site);
    }
    if (actionId === "unpublish") {
      return site?.status === "draft" &&
        site?.publishedAt === null &&
        !isDeletedSite(site);
    }
    if (actionId === "soft-delete") {
      return isDeletedSite(site) && site?.active === false;
    }
    if (actionId === "restore") {
      return !isDeletedSite(site);
    }

    return false;
  }

  function hasPublishedTimestamp(site) {
    return typeof site?.publishedAt === "string" && site.publishedAt.length > 0;
  }

  function isUncertainLifecycleError(error) {
    if (error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT") {
      return true;
    }
    if (error?.status === undefined && error?.code === undefined) {
      return true;
    }
    if (Number(error?.status) === 0) {
      return true;
    }
    if (Number(error?.status) >= 500) {
      return true;
    }

    return false;
  }

  function renderImageCleanupDeleteBlock(site, error, message) {
    const children = [
      createElement("span", {
        documentRef,
        text: message
      })
    ];

    if (typeof error?.requestId === "string") {
      children.push(createRequestIdControl(error.requestId, { documentRef }));
    }

    children.push(createElement("button", {
      documentRef,
      text: "Открыть изображения",
      attributes: {
        "data-action": "open-images-after-delete-block",
        type: "button"
      },
      on: {
        click: () => onImages(site.id)
      }
    }));

    replaceContent(statusRegion, ...children);
  }

  return {
    destroy,
    element,
    load,
    setFilters(nextFilters) {
      filters = normalizeSitesListFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
    }
  };
}

export function getAvailableLifecycleActions(site, role) {
  if (role !== "admin" || typeof site !== "object" || site === null) {
    return [];
  }
  if (site.deletedAt !== undefined && site.deletedAt !== null) {
    return [actionDescriptor("restore"), actionDescriptor("permanent-delete")];
  }
  if ("active" in site && site.active !== true) {
    return [];
  }
  if (site.status === "draft") {
    return [actionDescriptor("publish"), actionDescriptor("soft-delete")];
  }
  if (site.status === "published") {
    return [actionDescriptor("unpublish"), actionDescriptor("soft-delete")];
  }

  return [];
}

export function normalizeSitesListFilters(rawFilters, options = {}) {
  const source = typeof rawFilters === "object" && rawFilters !== null ? rawFilters : {};
  const normalized = {
    deleted: DELETED_VALUES.has(source.deleted) ? source.deleted : "without",
    direction: DIRECTION_VALUES.has(source.direction) ? source.direction : "desc",
    limit: clampInteger(source.limit, 20, 1, 100),
    page: options.filtersChanged ? 1 : clampInteger(source.page, 1, 1),
    sort: SORT_VALUES.has(source.sort) ? source.sort : "updatedAt"
  };
  const search = normalizeOptionalText(source.search, 100);
  const category = normalizeOptionalText(source.category, 80);

  if (search !== undefined) {
    normalized.search = search;
  }
  if (STATUS_VALUES.has(source.status)) {
    normalized.status = source.status;
  }
  if (category !== undefined) {
    normalized.category = category;
  }
  if (source.active === true || source.active === "true") {
    normalized.active = true;
  }
  if (source.active === false || source.active === "false") {
    normalized.active = false;
  }
  if (source.featured === true || source.featured === "true") {
    normalized.featured = true;
  }
  if (source.featured === false || source.featured === "false") {
    normalized.featured = false;
  }

  return normalized;
}

export function buildSitesListPath(rawFilters) {
  const normalized = normalizeSitesListFilters(rawFilters);
  const query = new URLSearchParams();
  const source = typeof rawFilters === "object" && rawFilters !== null ? rawFilters : {};

  for (const key of QUERY_ORDER) {
    if (!(key in source) || normalized[key] === undefined) {
      continue;
    }

    query.set(key, String(normalized[key]));
  }

  const text = query.toString();
  return text.length === 0 ? "/api/admin/sites" : `/api/admin/sites?${text}`;
}

function createFilterForm({ documentRef, onApply, onReset, role }) {
  const form = createElement("form", {
    documentRef,
    className: "admin-filter-bar",
    children: [
      createLabeledControl(documentRef, "Поиск", createElement("input", {
        documentRef,
        attributes: {
          autocomplete: "off",
          maxlength: "100",
          name: "search",
          type: "search"
        }
      })),
      createLabeledControl(documentRef, "Статус", createSelect(documentRef, "status", [
        ["", "Все"],
        ["draft", "Черновик"],
        ["published", "Опубликован"],
        ["archived", "Архив"]
      ])),
      createLabeledControl(documentRef, "Категория", createSelect(documentRef, "category", [
        ["", "Все"]
      ])),
      createLabeledControl(documentRef, "Сортировка", createSelect(documentRef, "sort", [
        ["updatedAt", "Обновление"],
        ["createdAt", "Создание"],
        ["title", "Название"],
        ["sortOrder", "Порядок"]
      ])),
      createLabeledControl(documentRef, "Направление", createSelect(documentRef, "direction", [
        ["desc", "По убыванию"],
        ["asc", "По возрастанию"]
      ])),
      createLabeledControl(documentRef, "Страница", createElement("input", {
        documentRef,
        attributes: {
          inputmode: "numeric",
          min: "1",
          name: "page",
          step: "1",
          type: "number",
          value: "1"
        }
      })),
      createLabeledControl(documentRef, "Лимит", createElement("input", {
        documentRef,
        attributes: {
          inputmode: "numeric",
          max: "100",
          min: "1",
          name: "limit",
          step: "1",
          type: "number",
          value: "20"
        }
      }))
    ]
  });

  if (role === "admin") {
    form.append(
      createLabeledControl(documentRef, "Активность", createSelect(documentRef, "active", [
        ["", "Все"],
        ["true", "Активные"],
        ["false", "Неактивные"]
      ])),
      createLabeledControl(documentRef, "Выделение", createSelect(documentRef, "featured", [
        ["", "Все"],
        ["true", "Да"],
        ["false", "Нет"]
      ])),
      createLabeledControl(documentRef, "Удаление", createSelect(documentRef, "deleted", [
        ["without", "Без удалённых"],
        ["with", "С удалёнными"],
        ["only", "Только удалённые"]
      ]))
    );
  }

  form.append(
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
          resetFormValues(form);
          onReset();
        }
      }
    })
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onApply(readFilterState(form));
  });

  return form;
}

function renderLoading(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    className: "admin-state",
    text: "Загрузка сайтов..."
  }));
}

function renderError(results, documentRef, error) {
  const requestId = typeof error?.requestId === "string" ? error.requestId : null;
  const message = typeof error?.message === "string" ? error.message : "Не удалось загрузить список.";
  const children = [
    createElement("p", {
      documentRef,
      className: "admin-state admin-state-error",
      text: message
    })
  ];

  if (requestId !== null) {
    children.push(createRequestIdControl(requestId, { documentRef }));
  }

  replaceContent(results, ...children);
}

function renderSites({ documentRef, filters, meta, onEdit, onImages, onLifecycleAction, results, role, sites }) {
  if (sites.length === 0) {
    replaceContent(results, createElement("p", {
      documentRef,
      className: "admin-state",
      text: hasActiveFilters(filters) ? "Ничего не найдено." : "Сайтов пока нет."
    }));
    return;
  }

  const table = createElement("table", {
    documentRef,
    className: "admin-sites-table",
    children: [
      createElement("thead", {
        documentRef,
        children: [
          createElement("tr", {
            documentRef,
            children: [
              createElement("th", { documentRef, text: "Название", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Slug", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Категория", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Статус", attributes: { scope: "col" } }),
              ...(role === "admin"
                ? [
                    createElement("th", { documentRef, text: "Активность", attributes: { scope: "col" } }),
                    createElement("th", { documentRef, text: "Просмотры", attributes: { scope: "col" } })
                  ]
                : []),
              createElement("th", { documentRef, text: "Действия", attributes: { scope: "col" } })
            ]
          })
        ]
      }),
      createElement("tbody", {
        documentRef,
        children: sites.map((site) => createSiteRow({
          documentRef,
          onEdit,
          onImages,
          onLifecycleAction,
          role,
          site
        }))
      })
    ]
  });
  const pagination = createElement("p", {
    documentRef,
    className: "admin-pagination",
    text: `Страница ${meta?.page ?? 1} из ${meta?.totalPages ?? 1}`
  });

  replaceContent(results, table, pagination);
}

function createSiteRow({ documentRef, onEdit, onImages, onLifecycleAction, role, site }) {
  const cells = [
    tableCell(documentRef, "Название", site.title ?? ""),
    tableCell(documentRef, "Slug", site.slug ?? ""),
    tableCell(documentRef, "Категория", site.category?.title ?? site.categoryId ?? ""),
    tableCell(documentRef, "Статус", siteStatusLabel(site.status))
  ];

  if (role === "admin") {
    cells.push(
      tableCell(documentRef, "Активность", site.active === true ? "Активен" : "Неактивен"),
      tableCell(documentRef, "Просмотры", site.views ?? "")
    );
  }

  const isDeleted = isDeletedSite(site);
  const lifecycleActions = createSiteLifecycleActionButtons({
    documentRef,
    onLifecycleAction,
    role,
    site
  });

  cells.push(createElement("td", {
    documentRef,
    attributes: {
      "data-label": "Действия"
    },
    children: [
      createElement("div", {
        documentRef,
        className: "admin-site-actions",
        children: [
          ...(isDeleted
            ? []
            : [
                createElement("button", {
                  documentRef,
                  text: "Редактировать",
                  attributes: {
                    "data-action": "edit-site",
                    "data-site-id": site.id,
                    type: "button"
                  },
                  on: {
                    click: () => onEdit(site.id)
                  }
                })
              ]),
          ...(canManageSiteImages(site, role)
            ? [
                createElement("button", {
                  documentRef,
                  text: "Изображения",
                  attributes: {
                    "data-action": "manage-images",
                    "data-site-id": site.id,
                    type: "button"
                  },
                  on: {
                    click: () => onImages(site.id)
                  }
                })
              ]
            : []),
          ...lifecycleActions
        ]
      })
    ]
  }));

  return createElement("tr", {
    documentRef,
    children: cells
  });
}

function createSiteLifecycleActionButtons({ documentRef, onLifecycleAction, role, site }) {
  const actions = getAvailableLifecycleActions(site, role);

  return actions.map((action) => createElement("button", {
      documentRef,
      text: action.label,
      attributes: {
        "data-lifecycle-action": action.id,
        "data-site-id": site.id,
        type: "button"
      },
      on: {
        click: (event) => {
          onLifecycleAction(site, action.id, event.currentTarget ?? event.target);
        }
      }
  }));
}

function tableCell(documentRef, label, text) {
  return createElement("td", {
    documentRef,
    attributes: {
      "data-label": label
    },
    text
  });
}

function siteStatusLabel(status) {
  if (status === "draft") {
    return "Черновик";
  }
  if (status === "published") {
    return "Опубликован";
  }
  if (status === "archived") {
    return "Архив";
  }

  return status ?? "";
}

function canManageSiteImages(site, role) {
  if (typeof site !== "object" || site === null) {
    return false;
  }
  if (isDeletedSite(site)) {
    return false;
  }
  if ("active" in site && site.active !== true) {
    return false;
  }
  if (site.status === "archived") {
    return false;
  }
  if (role === "editor") {
    return site.status === "draft";
  }

  return role === "admin" && (site.status === "draft" || site.status === "published");
}

function isDeletedSite(site) {
  return typeof site === "object" && site !== null && site.deletedAt !== undefined && site.deletedAt !== null;
}

function actionDescriptor(id) {
  return {
    id,
    label: LIFECYCLE_ACTIONS[id].label
  };
}

function confirmationPhrase(site) {
  return `${site.title ?? ""} / ${site.slug ?? ""}`.trim();
}

function visibleSiteName(site) {
  return `${site.title ?? site.slug ?? site.id} / ${site.slug ?? site.id}`;
}

function validateUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} id.`);
  }

  return value;
}

export function lifecycleErrorMessage(error) {
  if (typeof error?.code === "string" && LIFECYCLE_ERROR_MESSAGES[error.code] !== undefined) {
    return LIFECYCLE_ERROR_MESSAGES[error.code];
  }

  return [
    typeof error?.code === "string" ? error.code : null,
    typeof error?.message === "string" ? error.message : "Не удалось выполнить действие."
  ].filter(Boolean).join(": ");
}

function dialogError(error) {
  const nextError = new Error(lifecycleErrorMessage(error));
  nextError.requestId = typeof error?.requestId === "string" ? error.requestId : null;

  return nextError;
}

function updateCategoryOptions(form, categories, documentRef) {
  const select = form.querySelector('[name="category"]');
  if (select === null) {
    return;
  }

  replaceContent(select, createElement("option", {
    documentRef,
    text: "Все",
    attributes: {
      value: ""
    }
  }), ...categories.map((category) => createElement("option", {
    documentRef,
    text: category.title ?? category.slug ?? category.id,
    attributes: {
      value: category.id
    }
  })));
}

function createLabeledControl(documentRef, label, control) {
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

function createSelect(documentRef, name, options) {
  return createElement("select", {
    documentRef,
    attributes: { name },
    children: options.map(([value, label]) => createElement("option", {
      documentRef,
      text: label,
      attributes: { value }
    }))
  });
}

function readFilterState(form) {
  return Object.fromEntries(
    Array.from(
      form.querySelectorAll("[name]"),
      (field) => [field.name, field.value]
    )
  );
}

function resetFormValues(form) {
  for (const field of form.querySelectorAll("[name]")) {
    field.value = field.getAttribute("value") ?? "";
  }
}

function hasActiveFilters(filters) {
  return ["search", "status", "category", "active", "featured"].some((key) => filters[key] !== undefined);
}

function normalizeOptionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();

  if (text.length === 0) {
    return undefined;
  }

  return text.slice(0, maxLength);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const boundedMin = Math.max(parsed, min);

  return max === undefined ? boundedMin : Math.min(boundedMin, max);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
