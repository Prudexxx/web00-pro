import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";
import { FormValidationError, mapValidationDetails } from "../forms.js";

const QUERY_ORDER = ["search", "active", "includeCounts", "page", "limit"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_LIMITS = Object.freeze({
  description: 1000,
  search: 100,
  slug: 120,
  title: 120
});

export function createCategoriesScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  let activeController = null;
  let categories = [];
  let currentDialog = null;
  let destroyed = false;
  let editingCategory = null;
  let filters = normalizeCategoriesFilters({});
  let mutationBusy = false;
  let submitting = false;

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const formErrorRegion = createLiveRegion({
    className: "admin-form-error",
    documentRef,
    politeness: "assertive"
  });
  formErrorRegion.setAttribute("role", "alert");
  const results = createElement("section", {
    documentRef,
    className: "admin-category-results",
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
      filters = normalizeCategoriesFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
      void load();
    },
    onReset() {
      filters = normalizeCategoriesFilters({});
      void load();
    }
  });
  const categoryForm = role === "admin"
    ? createCategoryForm({
        documentRef,
        formErrorRegion,
        onCancel: resetCategoryForm,
        onSubmit: handleCategorySubmit
      })
    : null;
  const element = createElement("section", {
    documentRef,
    className: "admin-categories-screen",
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
                text: "Справочник"
              }),
              createElement("h2", {
                documentRef,
                text: "Категории"
              })
            ]
          })
        ]
      }),
      filterForm,
      ...(categoryForm === null ? [] : [categoryForm.element]),
      statusRegion,
      results,
      dialogHost
    ]
  });

  async function load() {
    if (role !== "admin" && role !== "editor") {
      renderForbidden(results, documentRef);
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading(results, documentRef);

    try {
      const response = await apiClient.requestJson(buildCategoriesListPath(filters), {
        method: "GET",
        signal: controller.signal
      });

      if (controller.signal.aborted || destroyed) {
        return;
      }

      categories = Array.isArray(response?.data) ? response.data : [];
      renderCategories({
        categories,
        documentRef,
        filters,
        onDelete: openDeleteDialog,
        onEdit: startEditCategory,
        results,
        role,
        meta: response?.meta ?? null
      });
      statusRegion.textContent = "Список категорий обновлён.";
      onStatus("Список категорий обновлён.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(results, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить категории.";
      onStatus("Не удалось загрузить категории.");
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

  function startEditCategory(category) {
    editingCategory = category;
    categoryForm?.setMode("edit", category);
    clearFormError(formErrorRegion);
  }

  function resetCategoryForm() {
    editingCategory = null;
    categoryForm?.setMode("create");
    clearFormError(formErrorRegion);
  }

  async function handleCategorySubmit(form) {
    if (submitting) {
      return;
    }

    submitting = true;
    mutationBusy = true;
    categoryForm?.setBusy(true);
    clearFormError(formErrorRegion);

    try {
      const formState = readCategoryFormState(form);
      const isEditing = editingCategory !== null;
      const requestPath = isEditing
        ? categoryPath(validateUuid(editingCategory.id, "category"))
        : "/api/admin/categories";
      const payload = isEditing
        ? buildCategoryUpdatePayload(editingCategory, formState)
        : buildCategoryCreatePayload(formState);
      const response = await apiClient.requestJson(requestPath, {
        body: payload,
        method: isEditing ? "PATCH" : "POST"
      });

      if (destroyed) {
        return;
      }

      statusRegion.textContent = isEditing ? "Категория обновлена." : "Категория создана.";
      onStatus(statusRegion.textContent);
      resetCategoryForm();
      await load();
      return response;
    } catch (error) {
      if (!destroyed) {
        renderFormError(formErrorRegion, documentRef, error);
        statusRegion.textContent = "Не удалось сохранить категорию.";
        onStatus("Не удалось сохранить категорию.");
      }
    } finally {
      submitting = false;
      mutationBusy = false;
      categoryForm?.setBusy(false);
    }
  }

  function openDeleteDialog(category, invoker) {
    if (role !== "admin") {
      return;
    }

    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmLabel: "Удалить",
      description: `Категория будет удалена после подтверждения сервером: ${visibleCategoryName(category)}.`,
      destructive: true,
      documentRef,
      onConfirm: async () => {
        await deleteCategory(category);
      },
      title: "Удалить категорию"
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  async function deleteCategory(category) {
    mutationBusy = true;

    try {
      await apiClient.requestJson(categoryPath(validateUuid(category.id, "category")), {
        method: "DELETE"
      });
      if (destroyed) {
        return;
      }

      statusRegion.textContent = "Категория удалена.";
      onStatus("Категория удалена.");
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
      filters = normalizeCategoriesFilters({ ...filters, ...nextFilters }, {
        filtersChanged: true
      });
    }
  };
}

export function normalizeCategoriesFilters(rawFilters, options = {}) {
  const source = toRecord(rawFilters);
  const normalized = {
    includeCounts: parseBoolean(source.includeCounts, true),
    limit: parseBoundedInteger(source.limit, 50, { max: 100, min: 1 }),
    page: options.filtersChanged === true ? 1 : parseBoundedInteger(source.page, 1, { min: 1 })
  };
  const search = normalizeText(source.search, CATEGORY_LIMITS.search);
  const active = parseOptionalBoolean(source.active);

  if (search !== undefined) {
    normalized.search = search;
  }
  if (active !== undefined) {
    normalized.active = active;
  }

  return normalized;
}

export function buildCategoriesListPath(rawFilters) {
  const filters = normalizeCategoriesFilters(rawFilters);
  const params = new URLSearchParams();

  for (const key of QUERY_ORDER) {
    const value = filters[key];
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  return `/api/admin/categories?${params.toString()}`;
}

export function buildCategoryCreatePayload(formState) {
  const source = toRecord(formState);
  const payload = {
    slug: normalizeCategorySlug(source.slug),
    title: requireText(source.title, "title", CATEGORY_LIMITS.title)
  };

  if (source.description !== undefined) {
    payload.description = serializeNullableCategoryText(source.description, "description", CATEGORY_LIMITS.description);
  }
  if (source.sortOrder !== undefined) {
    const sortOrder = serializeNonNegativeCategoryInteger(source.sortOrder, "sortOrder");
    if (sortOrder !== null) {
      payload.sortOrder = sortOrder;
    }
  }
  if (source.active !== undefined) {
    payload.active = source.active === true || source.active === "true" || source.active === "on";
  }

  return payload;
}

export function buildCategoryUpdatePayload(original, formState) {
  const source = toRecord(formState);
  const payload = {};
  const current = toRecord(original);

  if (source.slug !== undefined) {
    const slug = normalizeCategorySlug(source.slug);
    if (slug !== current.slug) {
      payload.slug = slug;
    }
  }
  if (source.title !== undefined) {
    const title = requireText(source.title, "title", CATEGORY_LIMITS.title);
    if (title !== current.title) {
      payload.title = title;
    }
  }
  if (source.description !== undefined) {
    const description = serializeNullableCategoryText(source.description, "description", CATEGORY_LIMITS.description);
    if (description !== (current.description ?? null)) {
      payload.description = description;
    }
  }
  if (source.sortOrder !== undefined) {
    const sortOrder = serializeNonNegativeCategoryInteger(source.sortOrder, "sortOrder");
    if (sortOrder !== null && sortOrder !== current.sortOrder) {
      payload.sortOrder = sortOrder;
    }
  }
  if (source.active !== undefined) {
    const active = source.active === true || source.active === "true" || source.active === "on";
    if (active !== current.active) {
      payload.active = active;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw validationError("_form", "Must include at least one field.");
  }

  return payload;
}

function createFilterForm({ documentRef, filters, onApply, onReset }) {
  const searchInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: String(CATEGORY_LIMITS.search),
      name: "categorySearch",
      placeholder: "Поиск",
      type: "search",
      value: filters.search ?? ""
    }
  });
  const activeSelect = createSelect(documentRef, "categoryActive", [
    ["", "Любая активность"],
    ["true", "Активные"],
    ["false", "Неактивные"]
  ], filters.active === undefined ? "" : String(filters.active));
  const includeCounts = createElement("input", {
    documentRef,
    attributes: {
      checked: filters.includeCounts,
      name: "categoryIncludeCounts",
      type: "checkbox"
    }
  });
  includeCounts.checked = filters.includeCounts;
  const pageInput = createElement("input", {
    documentRef,
    attributes: {
      inputmode: "numeric",
      min: "1",
      name: "categoryPage",
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
      name: "categoryLimit",
      step: "1",
      type: "number",
      value: String(filters.limit)
    }
  });
  const form = createElement("form", {
    documentRef,
    className: "admin-filter-form admin-category-filters",
    attributes: {
      "data-action": "filter-categories"
    },
    children: [
      labeled(documentRef, "Поиск", searchInput),
      labeled(documentRef, "Активность", activeSelect),
      createElement("label", {
        documentRef,
        className: "admin-check-field",
        children: [
          includeCounts,
          createElement("span", {
            documentRef,
            text: "Показывать количество сайтов"
          })
        ]
      }),
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
            activeSelect.value = "";
            includeCounts.checked = true;
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
          includeCounts: includeCounts.checked,
          limit: limitInput.value,
          page: pageInput.value,
          search: searchInput.value
        });
      }
    }
  });

  return form;
}

function createCategoryForm({ documentRef, formErrorRegion, onCancel, onSubmit }) {
  const title = createElement("h3", {
    documentRef,
    text: "Создание категории"
  });
  const slugInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: String(CATEGORY_LIMITS.slug),
      name: "categorySlug",
      required: true,
      type: "text"
    }
  });
  const titleInput = createElement("input", {
    documentRef,
    attributes: {
      autocomplete: "off",
      maxlength: String(CATEGORY_LIMITS.title),
      name: "categoryTitle",
      required: true,
      type: "text"
    }
  });
  const descriptionInput = createElement("textarea", {
    documentRef,
    attributes: {
      maxlength: String(CATEGORY_LIMITS.description),
      name: "categoryDescription",
      rows: "4"
    }
  });
  const sortInput = createElement("input", {
    documentRef,
    attributes: {
      inputmode: "numeric",
      min: "0",
      name: "categorySortOrder",
      step: "1",
      type: "number"
    }
  });
  const activeInput = createElement("input", {
    documentRef,
    attributes: {
      checked: true,
      name: "categoryActive",
      type: "checkbox"
    }
  });
  activeInput.checked = true;
  const submitButton = createElement("button", {
    documentRef,
    text: "Создать категорию",
    attributes: {
      type: "submit"
    }
  });
  const cancelButton = createElement("button", {
    documentRef,
    text: "Отменить",
    attributes: {
      type: "button"
    },
    on: {
      click: onCancel
    }
  });
  const form = createElement("form", {
    documentRef,
    className: "admin-mutation-form admin-category-form",
    attributes: {
      "data-action": "create-category"
    },
    children: [
      title,
      labeled(documentRef, "Slug", slugInput),
      labeled(documentRef, "Название", titleInput),
      labeled(documentRef, "Описание", descriptionInput),
      labeled(documentRef, "Порядок", sortInput),
      createElement("label", {
        documentRef,
        className: "admin-check-field",
        children: [
          activeInput,
          createElement("span", {
            documentRef,
            text: "Активна"
          })
        ]
      }),
      formErrorRegion,
      createElement("div", {
        documentRef,
        className: "admin-form-actions",
        children: [submitButton, cancelButton]
      })
    ],
    on: {
      submit: (event) => {
        event.preventDefault();
        void onSubmit(form);
      }
    }
  });

  function setMode(mode, category = null) {
    const editing = mode === "edit" && category !== null;
    title.textContent = editing ? "Редактирование категории" : "Создание категории";
    form.setAttribute("data-action", editing ? "save-category" : "create-category");
    submitButton.textContent = editing ? "Сохранить" : "Создать категорию";
    slugInput.value = editing ? String(category.slug ?? "") : "";
    titleInput.value = editing ? String(category.title ?? "") : "";
    descriptionInput.value = editing ? String(category.description ?? "") : "";
    sortInput.value = editing && category.sortOrder !== undefined ? String(category.sortOrder) : "";
    activeInput.checked = editing ? category.active !== false : true;
  }

  function setBusyState(busy) {
    setBusy(submitButton, busy);
    setBusy(cancelButton, busy);
  }

  return {
    element: form,
    setBusy: setBusyState,
    setMode
  };
}

function readCategoryFormState(form) {
  return {
    active: form.querySelector('[name="categoryActive"]')?.checked === true,
    description: form.querySelector('[name="categoryDescription"]')?.value,
    slug: form.querySelector('[name="categorySlug"]')?.value,
    sortOrder: form.querySelector('[name="categorySortOrder"]')?.value,
    title: form.querySelector('[name="categoryTitle"]')?.value
  };
}

function renderCategories({ categories, documentRef, filters, onDelete, onEdit, results, role, meta }) {
  if (categories.length === 0) {
    const filtered = filters.search !== undefined || filters.active !== undefined;
    replaceContent(results, createElement("p", {
      documentRef,
      text: filtered ? "Ничего не найдено." : "Категорий пока нет."
    }));
    return;
  }

  const table = createElement("table", {
    documentRef,
    className: "admin-data-table admin-category-table",
    children: [
      createElement("thead", {
        documentRef,
        children: [
          createElement("tr", {
            documentRef,
            children: [
              createElement("th", { documentRef, text: "ID", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Slug", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Название", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Описание", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Порядок", attributes: { scope: "col" } }),
              createElement("th", { documentRef, text: "Сайты", attributes: { scope: "col" } }),
              ...(role === "admin"
                ? [
                    createElement("th", { documentRef, text: "Активность", attributes: { scope: "col" } }),
                    createElement("th", { documentRef, text: "Создано", attributes: { scope: "col" } }),
                    createElement("th", { documentRef, text: "Обновлено", attributes: { scope: "col" } }),
                    createElement("th", { documentRef, text: "Действия", attributes: { scope: "col" } })
                  ]
                : [])
            ]
          })
        ]
      }),
      createElement("tbody", {
        documentRef,
        children: categories.map((category) => renderCategoryRow({
          category,
          documentRef,
          onDelete,
          onEdit,
          role
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

function renderCategoryRow({ category, documentRef, onDelete, onEdit, role }) {
  const cells = [
    tableCell(documentRef, "ID", category.id ?? ""),
    tableCell(documentRef, "Slug", category.slug ?? ""),
    tableCell(documentRef, "Название", category.title ?? ""),
    tableCell(documentRef, "Описание", category.description ?? ""),
    tableCell(documentRef, "Порядок", category.sortOrder ?? ""),
    tableCell(documentRef, "Сайты", category.siteCount ?? "")
  ];

  if (role === "admin") {
    cells.push(
      createElement("td", {
        documentRef,
        attributes: {
          "data-label": "Активность"
        },
        children: [
          createElement("span", {
            documentRef,
            className: `admin-badge ${category.active === true ? "is-active" : "is-muted"}`,
            text: category.active === true ? "Активна" : "Неактивна"
          })
        ]
      }),
      tableCell(documentRef, "Создано", category.createdAt ?? ""),
      tableCell(documentRef, "Обновлено", category.updatedAt ?? ""),
      createElement("td", {
        documentRef,
        attributes: {
          "data-label": "Действия"
        },
        children: [
          createElement("div", {
            documentRef,
            className: "admin-row-actions",
            children: [
              createElement("button", {
                documentRef,
                text: "Редактировать",
                attributes: {
                  "data-action": "edit-category",
                  type: "button"
                },
                on: {
                  click: () => onEdit(category)
                }
              }),
              createElement("button", {
                documentRef,
                text: "Удалить",
                attributes: {
                  "data-action": "delete-category",
                  type: "button"
                },
                on: {
                  click: (event) => onDelete(category, event.target)
                }
              })
            ]
          })
        ]
      })
    );
  }

  return createElement("tr", {
    documentRef,
    children: cells
  });
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

function renderLoading(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Загрузка категорий..."
  }));
}

function renderForbidden(results, documentRef) {
  replaceContent(results, createElement("p", {
    documentRef,
    text: "Недостаточно прав для просмотра категорий."
  }));
}

function renderError(results, documentRef, error) {
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

  replaceContent(results, ...children);
}

function renderFormError(region, documentRef, error) {
  const children = [];

  if (error instanceof FormValidationError) {
    const mapped = mapValidationDetails(error.details);
    for (const messages of Object.values(mapped)) {
      for (const message of messages) {
        children.push(createElement("span", {
          documentRef,
          text: message
        }));
      }
    }
  } else {
    children.push(createElement("span", {
      documentRef,
      text: safeMessage(error)
    }));
  }

  const requestId = safeRequestId(error);
  if (requestId !== null) {
    children.push(createRequestIdControl(requestId, { documentRef }));
  }

  replaceContent(region, ...children);
}

function clearFormError(region) {
  replaceContent(region);
}

function categoryPath(categoryId) {
  return `/api/admin/categories/${encodeURIComponent(categoryId)}`;
}

function validateUuid(value, label) {
  const text = String(value ?? "");

  if (!UUID_PATTERN.test(text)) {
    throw validationError(label, "Must be a valid UUID.");
  }

  return text;
}

function normalizeCategorySlug(value) {
  const slug = requireText(value, "slug", CATEGORY_LIMITS.slug).toLowerCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw validationError("slug", "Slug must use lowercase letters, numbers, and single hyphens.");
  }

  return slug;
}

function requireText(value, fieldName, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    throw validationError(fieldName, `${fieldName} is required.`);
  }
  if (text.length > maxLength) {
    throw validationError(fieldName, `Must be at most ${maxLength} characters.`);
  }

  return text;
}

function serializeNullableCategoryText(value, fieldName, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength) {
    throw validationError(fieldName, `Must be at most ${maxLength} characters.`);
  }

  return text;
}

function serializeNonNegativeCategoryInteger(value, fieldName) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    throw validationError(fieldName, "Must be zero or a positive integer.");
  }

  return Number.parseInt(text, 10);
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

function parseBoolean(value, defaultValue) {
  return parseOptionalBoolean(value) ?? defaultValue;
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

function visibleCategoryName(category) {
  const title = typeof category?.title === "string" && category.title.length > 0 ? category.title : null;
  const slug = typeof category?.slug === "string" && category.slug.length > 0 ? category.slug : null;
  return title ?? slug ?? String(category?.id ?? "category");
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
