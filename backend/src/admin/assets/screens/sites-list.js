import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";

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

export function createSitesListScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const onCreate = typeof options?.onCreate === "function" ? options.onCreate : () => {};
  const onEdit = typeof options?.onEdit === "function" ? options.onEdit : () => {};
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  let activeController = null;
  let categories = [];
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
            text: "Создать draft",
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
      results
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
        onEdit,
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
      filters = normalizeSitesListFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
    }
  };
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
          name: "search",
          type: "search"
        }
      })),
      createLabeledControl(documentRef, "Статус", createSelect(documentRef, "status", [
        ["", "Все"],
        ["draft", "Draft"],
        ["published", "Published"],
        ["archived", "Archived"]
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
          min: "1",
          name: "page",
          type: "number",
          value: "1"
        }
      })),
      createLabeledControl(documentRef, "Лимит", createElement("input", {
        documentRef,
        attributes: {
          max: "100",
          min: "1",
          name: "limit",
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
      createLabeledControl(documentRef, "Featured", createSelect(documentRef, "featured", [
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

function renderSites({ documentRef, filters, meta, onEdit, results, role, sites }) {
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
        children: sites.map((site) => createSiteRow({ documentRef, onEdit, role, site }))
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

function createSiteRow({ documentRef, onEdit, role, site }) {
  const cells = [
    createElement("td", { documentRef, text: site.title ?? "" }),
    createElement("td", { documentRef, text: site.slug ?? "" }),
    createElement("td", { documentRef, text: site.category?.title ?? site.categoryId ?? "" }),
    createElement("td", { documentRef, text: site.status ?? "" })
  ];

  if (role === "admin") {
    cells.push(
      createElement("td", { documentRef, text: site.active === true ? "Активен" : "Неактивен" }),
      createElement("td", { documentRef, text: site.views ?? "" })
    );
  }

  cells.push(createElement("td", {
    documentRef,
    children: [
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
    ]
  }));

  return createElement("tr", {
    documentRef,
    children: cells
  });
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
    form.querySelectorAll("[name]").map((field) => [field.name, field.value])
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
