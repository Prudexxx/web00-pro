import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  stringifySafeJson
} from "../dom.js";

const QUERY_ORDER = ["action", "actorUserId", "entityId", "entityType", "from", "to", "sort", "page", "limit"];
const ENTITY_TYPES = new Set(["auth", "category", "site", "upload", "user"]);
const SORT_VALUES = new Set(["newest", "oldest"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAuditScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  const clipboard = options?.clipboard;
  let activeController = null;
  let destroyed = false;
  let filters = normalizeAuditFilters({});

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const results = createElement("section", {
    documentRef,
    className: "admin-audit-results",
    attributes: {
      "aria-live": "polite"
    }
  });
  const filterForm = createFilterForm({
    documentRef,
    filters,
    onApply(nextFilters) {
      filters = normalizeAuditFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
      void load();
    },
    onReset() {
      filters = normalizeAuditFilters({});
      void load();
    }
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-audit-screen",
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
                text: "Контроль"
              }),
              createElement("h2", {
                documentRef,
                text: "Журнал аудита"
              })
            ]
          })
        ]
      }),
      ...(role === "admin" ? [filterForm] : []),
      statusRegion,
      results
    ]
  });

  async function load() {
    if (role !== "admin") {
      renderForbidden(results, documentRef);
      statusRegion.textContent = "Недостаточно прав.";
      onStatus("Недостаточно прав.");
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading(results, documentRef);

    try {
      const response = await apiClient.requestJson(buildAuditListPath(filters), {
        method: "GET",
        signal: controller.signal
      });

      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderAuditEntries({
        clipboard,
        documentRef,
        entries: Array.isArray(response?.data) ? response.data : [],
        filters,
        results,
        meta: response?.meta ?? null
      });
      statusRegion.textContent = "Журнал аудита обновлён.";
      onStatus("Журнал аудита обновлён.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(results, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить журнал аудита.";
      onStatus("Не удалось загрузить журнал аудита.");
    }
  }

  function destroy() {
    destroyed = true;
    abortActiveRequest();
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
  }

  return {
    destroy,
    element,
    load,
    setFilters(nextFilters) {
      filters = normalizeAuditFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
    }
  };
}

export function normalizeAuditFilters(rawFilters, options = {}) {
  const source = toRecord(rawFilters);
  const normalized = {
    limit: parseBoundedInteger(source.limit, 50, { max: 100, min: 1 }),
    page: options.filtersChanged === true ? 1 : parseBoundedInteger(source.page, 1, { min: 1 }),
    sort: SORT_VALUES.has(source.sort) ? source.sort : "newest"
  };
  const action = normalizeText(source.action, 80);
  const actorUserId = normalizeUuid(source.actorUserId);
  const entityId = normalizeUuid(source.entityId);
  const entityType = ENTITY_TYPES.has(source.entityType) ? source.entityType : undefined;
  const from = normalizeDate(source.from);
  const to = normalizeDate(source.to);

  if (action !== undefined) {
    normalized.action = action;
  }
  if (actorUserId !== undefined) {
    normalized.actorUserId = actorUserId;
  }
  if (entityId !== undefined) {
    normalized.entityId = entityId;
  }
  if (entityType !== undefined) {
    normalized.entityType = entityType;
  }
  if (from !== undefined) {
    normalized.from = from;
  }
  if (to !== undefined) {
    normalized.to = to;
  }

  return normalized;
}

export function buildAuditListPath(rawFilters) {
  const filters = normalizeAuditFilters(rawFilters);
  const params = new URLSearchParams();

  for (const key of QUERY_ORDER) {
    const value = filters[key];
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  return `/api/admin/audit-logs?${params.toString()}`;
}

function createFilterForm({ documentRef, filters, onApply, onReset }) {
  const actionInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: "80",
      name: "auditAction",
      placeholder: "Фильтр по действию",
      type: "search",
      value: filters.action ?? ""
    }
  });
  const actorInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: "36",
      name: "auditActorUserId",
      placeholder: "UUID автора",
      type: "text",
      value: filters.actorUserId ?? ""
    }
  });
  const entityIdInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: "36",
      name: "auditEntityId",
      placeholder: "UUID сущности",
      type: "text",
      value: filters.entityId ?? ""
    }
  });
  const entityTypeSelect = createSelect(documentRef, "auditEntityType", [
    ["", "Любая сущность"],
    ["auth", "Аутентификация"],
    ["category", "Категория"],
    ["site", "Сайт"],
    ["upload", "Загрузка"],
    ["user", "Пользователь"]
  ], filters.entityType ?? "");
  const fromInput = createElement("input", {
    documentRef,
    attributes: {
      name: "auditFrom",
      type: "datetime-local",
      value: filters.from ?? ""
    }
  });
  const toInput = createElement("input", {
    documentRef,
    attributes: {
      name: "auditTo",
      type: "datetime-local",
      value: filters.to ?? ""
    }
  });
  const sortSelect = createSelect(documentRef, "auditSort", [
    ["newest", "Сначала новые"],
    ["oldest", "Сначала старые"]
  ], filters.sort);
  const pageInput = createElement("input", {
    documentRef,
    attributes: {
      inputmode: "numeric",
      min: "1",
      name: "auditPage",
      step: "1",
      type: "number",
      value: String(filters.page)
    }
  });
  const limitInput = createElement("input", {
    documentRef,
    attributes: {
      inputmode: "numeric",
      max: "100",
      min: "1",
      name: "auditLimit",
      step: "1",
      type: "number",
      value: String(filters.limit)
    }
  });

  return createElement("form", {
    documentRef,
    className: "admin-filter-form admin-audit-filters",
    attributes: {
      "data-action": "filter-audit"
    },
    children: [
      labeled(documentRef, "Действие", actionInput),
      labeled(documentRef, "ID автора", actorInput),
      labeled(documentRef, "ID сущности", entityIdInput),
      labeled(documentRef, "Тип сущности", entityTypeSelect),
      labeled(documentRef, "С даты", fromInput),
      labeled(documentRef, "По дату", toInput),
      labeled(documentRef, "Порядок", sortSelect),
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
            actionInput.value = "";
            actorInput.value = "";
            entityIdInput.value = "";
            entityTypeSelect.value = "";
            fromInput.value = "";
            toInput.value = "";
            sortSelect.value = "newest";
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
          action: actionInput.value,
          actorUserId: actorInput.value,
          entityId: entityIdInput.value,
          entityType: entityTypeSelect.value,
          from: fromInput.value,
          limit: limitInput.value,
          page: pageInput.value,
          sort: sortSelect.value,
          to: toInput.value
        });
      }
    }
  });
}

function renderAuditEntries({ clipboard, documentRef, entries, filters, results, meta }) {
  if (entries.length === 0) {
    const filtered = filters.action !== undefined ||
      filters.actorUserId !== undefined ||
      filters.entityId !== undefined ||
      filters.entityType !== undefined ||
      filters.from !== undefined ||
      filters.to !== undefined;
    replaceContent(results, createElement("p", {
      documentRef,
      text: filtered ? "Ничего не найдено." : "Записей пока нет."
    }));
    return;
  }

  const list = createElement("div", {
    documentRef,
    className: "admin-audit-list",
    children: entries.map((entry) => renderAuditEntry({ clipboard, documentRef, entry }))
  });
  const pagination = createElement("p", {
    documentRef,
    className: "admin-pagination-note",
    text: paginationText(meta)
  });

  replaceContent(results, list, pagination);
}

function renderAuditEntry({ clipboard, documentRef, entry }) {
  return createElement("article", {
    documentRef,
    className: "admin-audit-entry",
    children: [
      createElement("header", {
        documentRef,
        className: "admin-audit-entry-header",
        children: [
          createElement("h3", {
            documentRef,
            text: entry.action ?? ""
          }),
          createElement("span", {
            documentRef,
            className: "admin-badge is-muted",
            text: entry.createdAt ?? ""
          })
        ]
      }),
      createElement("p", {
        documentRef,
        text: `Автор: ${formatActor(entry.actor)}`
      }),
      createElement("p", {
        documentRef,
        text: `Сущность: ${entry.entityType ?? ""} ${entry.entityId ?? ""}`
      }),
      createElement("p", {
        documentRef,
        text: "requestId: "
      }),
      createRequestIdControl(entry.requestId ?? "", { clipboard, documentRef }),
      createJsonDetails(documentRef, "До изменения", entry.beforeJson),
      createJsonDetails(documentRef, "После изменения", entry.afterJson)
    ]
  });
}

function createJsonDetails(documentRef, label, value) {
  return createElement("details", {
    documentRef,
    className: "admin-json-details",
    children: [
      createElement("summary", {
        documentRef,
        text: label
      }),
      createElement("pre", {
        documentRef,
        className: "admin-json-block",
        children: [
          createElement("code", {
            documentRef,
            text: stringifySafeJson(value, { maxLength: 4000 })
          })
        ]
      })
    ]
  });
}

function renderLoading(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Загрузка журнала аудита..."
  }));
}

function renderForbidden(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Недостаточно прав для просмотра журнала аудита."
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

function formatActor(actor) {
  if (actor === null || actor === undefined) {
    return "Система / CLI";
  }

  const email = typeof actor.email === "string" ? actor.email : "";
  const id = typeof actor.id === "string" ? actor.id : "";
  const role = typeof actor.role === "string" ? actor.role : "";
  return `${email} ${role} ${id}`.trim();
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return undefined;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeUuid(value) {
  const text = String(value ?? "").trim();
  return UUID_PATTERN.test(text) ? text : undefined;
}

function normalizeText(value, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    return undefined;
  }

  return text.slice(0, maxLength);
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

function paginationText(meta) {
  if (typeof meta?.page === "number" && typeof meta?.totalPages === "number") {
    return `Страница ${meta.page} из ${meta.totalPages}. Всего: ${meta.total ?? 0}.`;
  }

  return "";
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
