import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  focusFirstInvalid,
  replaceContent,
  setBusy
} from "../dom.js";
import {
  DB_INT_MAX,
  FormValidationError,
  SITE_LIMITS,
  buildCreateSitePayload,
  buildUpdateSitePayload,
  mapValidationDetails
} from "../forms.js";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const DEMO_MODE_OPTIONS = Object.freeze([
  {
    label: "Без демо",
    value: "none"
  },
  {
    label: "Внешнее демо",
    value: "external-iframe"
  }
]);
const FIELD_MAX_LENGTHS = Object.freeze({
  deliveryLabel: SITE_LIMITS.deliveryLabel,
  demoLocalUrl: SITE_LIMITS.url,
  demoUrl: SITE_LIMITS.url,
  externalDemoUrl: SITE_LIMITS.url,
  fullDescription: SITE_LIMITS.fullDescription,
  legacyTitle: SITE_LIMITS.legacyTitle,
  originalDemoUrl: SITE_LIMITS.url,
  previewType: SITE_LIMITS.previewType,
  priceLabel: SITE_LIMITS.priceLabel,
  shortDescription: SITE_LIMITS.shortDescription,
  siteUrl: SITE_LIMITS.url,
  slug: SITE_LIMITS.slug,
  title: SITE_LIMITS.title
});
const URL_FIELDS = new Set(["demoLocalUrl", "demoUrl", "externalDemoUrl", "originalDemoUrl", "siteUrl"]);
const REQUIRED_FIELDS = new Set(["categoryId", "shortDescription", "slug", "title"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSiteEditorScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const mode = options?.mode === "edit" ? "edit" : "create";
  const role = options?.role === "admin" ? "admin" : "editor";
  const siteId = options?.siteId;
  const onCancel = typeof options?.onCancel === "function" ? options.onCancel : () => {};
  const onImages = typeof options?.onImages === "function" ? options.onImages : () => {};
  const onSaved = typeof options?.onSaved === "function" ? options.onSaved : () => {};
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  let activeController = null;
  let busy = false;
  let destroyed = false;
  let currentSite = null;
  let categories = [];
  let lastFormState = {};

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const formHost = createElement("section", {
    documentRef,
    className: "admin-editor-host"
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-site-editor",
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
                text: "Сайт"
              }),
              createElement("h2", {
                documentRef,
                text: mode === "create" ? "Создать черновик" : "Редактировать карточку"
              })
            ]
          })
        ]
      }),
      statusRegion,
      formHost
    ]
  });

  async function load() {
    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading();

    try {
      const requests = [
        apiClient.requestJson(CATEGORY_PATH, {
          method: "GET",
          signal: controller.signal
        })
      ];

      if (mode === "edit") {
        requests.push(apiClient.requestJson(sitePath(siteId), {
          method: "GET",
          signal: controller.signal
        }));
      }

      const [categoryResponse, siteResponse] = await Promise.all(requests);

      if (controller.signal.aborted || destroyed) {
        return;
      }

      categories = Array.isArray(categoryResponse?.data) ? categoryResponse.data : [];
      currentSite = siteResponse?.data ?? null;
      renderForm({});
      statusRegion.textContent = "Форма готова.";
      onStatus("Форма готова.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderScreenError(error);
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

  function renderLoading() {
    replaceContent(formHost, createElement("p", {
      documentRef,
      className: "admin-state",
      text: "Загрузка формы..."
    }));
  }

  function renderForm(errors) {
    const form = createForm(errors);
    replaceContent(formHost, form);
  }

  function createForm(errors) {
    const form = createElement("form", {
      documentRef,
      className: "admin-editor-form",
      children: [
        createBasicSection(errors),
        createCatalogSection(errors),
        createLinksSection(errors),
        createCommercialSection(errors),
        ...(role === "admin" && mode === "edit" ? [createAdminSection(errors)] : []),
        createActions()
      ]
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) {
        return;
      }

      const submitButton = form.querySelector('[data-action="save-site"]');
      busy = true;
      setBusy(submitButton, true);

      try {
        const formState = readFormState(form);
        lastFormState = formState;
        const payload = mode === "create"
          ? buildCreateSitePayload(formState)
          : buildUpdateSitePayload(formState, role);
        const response = await apiClient.requestJson(
          mode === "create" ? "/api/admin/sites" : sitePath(siteId),
          {
            body: payload,
            method: mode === "create" ? "POST" : "PATCH"
          }
        );
        const saved = response?.data ?? null;
        currentSite = saved;
        statusRegion.textContent = "Сохранено.";
        onStatus("Сохранено.");
        onSaved(saved);
      } catch (error) {
        const mapped = error instanceof FormValidationError
          ? mapValidationDetails(error.details)
          : mapValidationDetails(error?.details);

        renderForm(Object.keys(mapped).length === 0 ? { _form: [safeMessage(error)] } : mapped);
        renderErrorStatus(error);
        focusFirstInvalid(formHost.querySelector("form"), mapped);
      } finally {
        busy = false;
        const nextButton = formHost.querySelector('[data-action="save-site"]');
        if (nextButton !== null) {
          setBusy(nextButton, false);
        }
      }
    });

    return form;
  }

  function createBasicSection(errors) {
    const children = [
      createField("title", "Название", "input", errors, readValue("title")),
      ...(mode === "create" || role === "admin"
        ? [createField("slug", "Slug", "input", errors, readValue("slug"))]
        : []),
      createCategoryField(errors),
      createField("shortDescription", "Короткое описание", "textarea", errors, readValue("shortDescription")),
      createField("fullDescription", "Полное описание", "textarea", errors, readValue("fullDescription"))
    ];

    return createSection("Основное", children);
  }

  function createCatalogSection(errors) {
    return createSection("Каталог", [
      createArrayField("features", "Особенности", errors, readArrayValue("features")),
      createArrayField("tags", "Теги", errors, readArrayValue("tags")),
      createField("legacyTitle", "Старое название", "input", errors, readValue("legacyTitle")),
      createField("previewType", "Тип превью", "input", errors, readValue("previewType")),
      createDemoModeField(errors)
    ]);
  }

  function createLinksSection(errors) {
    return createSection("Ссылки", [
      createField("demoUrl", "Ссылка на демо", "input", errors, readValue("demoUrl")),
      createField("demoLocalUrl", "Локальная ссылка", "input", errors, readValue("demoLocalUrl")),
      createField("externalDemoUrl", "Внешняя ссылка", "input", errors, readValue("externalDemoUrl")),
      createField("originalDemoUrl", "Исходная ссылка", "input", errors, readValue("originalDemoUrl")),
      createField("siteUrl", "Ссылка на сайт", "input", errors, readValue("siteUrl"))
    ]);
  }

  function createCommercialSection(errors) {
    return createSection("Коммерция", [
      createField("priceAmountCents", "Цена в копейках", "input", errors, readValue("priceAmountCents"), {
        max: String(DB_INT_MAX),
        type: "number"
      }),
      createField("priceLabel", "Метка цены", "input", errors, readValue("priceLabel")),
      createField("developmentDays", "Дней разработки", "input", errors, readValue("developmentDays"), {
        max: String(DB_INT_MAX),
        type: "number"
      }),
      createField("deliveryLabel", "Срок поставки", "input", errors, readValue("deliveryLabel")),
      createField("sortOrder", "Порядок", "input", errors, readValue("sortOrder"), {
        max: String(DB_INT_MAX),
        min: "0",
        type: "number"
      })
    ]);
  }

  function createAdminSection(errors) {
    const input = createElement("input", {
      documentRef,
      attributes: {
        name: "featured",
        type: "checkbox"
      }
    });

    input.checked = lastFormState.featured ?? currentSite?.featured === true;

    return createSection("Администратор", [
      createElement("label", {
        documentRef,
        className: "admin-checkbox",
        children: [
          input,
          createElement("span", {
            documentRef,
            text: "Выделять"
          })
        ]
      }),
      renderFieldErrors("featured", errors)
    ]);
  }

  function createActions() {
    return createElement("div", {
      documentRef,
      className: "admin-editor-actions",
      children: [
        createElement("button", {
          documentRef,
          text: "Сохранить",
          attributes: {
            "data-action": "save-site",
            type: "submit"
          }
        }),
        createElement("button", {
          documentRef,
          text: "Отмена",
          attributes: {
            "data-action": "cancel-editor",
            type: "button"
          },
          on: {
            click: onCancel
          }
        })
      ].concat(mode === "edit" && currentSite?.id !== undefined
        ? [
            createElement("button", {
              documentRef,
              text: "Изображения",
              attributes: {
                "data-action": "manage-images",
                type: "button"
              },
              on: {
                click: () => onImages(currentSite.id)
              }
            })
          ]
        : [])
    });
  }

  function createDemoModeField(errors) {
    const errorId = fieldErrorId("demoMode");
    const hintId = "admin-field-help-demoMode";
    const select = createElement("select", {
      documentRef,
      attributes: {
        "aria-describedby": `${hintId} ${errorId}`,
        name: "demoMode"
      },
      children: DEMO_MODE_OPTIONS.map((option) => createElement("option", {
        documentRef,
        text: option.label,
        attributes: {
          value: option.value
        }
      }))
    });

    select.value = readDemoModeValue();

    return createElement("label", {
      documentRef,
      className: "admin-field",
      children: [
        createElement("span", { documentRef, text: "Режим демо" }),
        select,
        createElement("span", {
          documentRef,
          className: "admin-field-help",
          attributes: { id: hintId },
          text: "Выберите “Без демо”, если отдельной рабочей ссылки нет. При выборе “Без демо” публичная карточка покажет “Подробнее”; ссылки можно очистить вручную."
        }),
        renderFieldErrors("demoMode", errors)
      ]
    });
  }

  function createSection(title, children) {
    return createElement("fieldset", {
      documentRef,
      className: "admin-editor-section",
      children: [
        createElement("legend", {
          documentRef,
          text: title
        }),
        ...children
      ]
    });
  }

  function createField(name, label, kind, errors, value, attributes = {}) {
    const fieldAttributes = buildFieldAttributes(name, kind, attributes);
    const control = createElement(kind, {
      documentRef,
      attributes: fieldAttributes
    });

    control.value = value === null || value === undefined ? "" : String(value);

    return createElement("label", {
      documentRef,
      className: "admin-field",
      children: [
        createElement("span", {
          documentRef,
          text: label
        }),
        control,
        renderFieldErrors(name, errors)
      ]
    });
  }

  function createArrayField(name, label, errors, values) {
    const limits = SITE_LIMITS[name];
    const errorId = fieldErrorId(name);
    const maxItems = typeof limits?.max === "number" ? limits.max : 30;
    const itemMaxLength = typeof limits?.item === "number" ? limits.item : 160;
    const textarea = createElement("textarea", {
      documentRef,
      attributes: {
        "aria-describedby": errorId,
        "data-item-maxlength": String(itemMaxLength),
        "data-max-items": String(maxItems),
        maxlength: String((itemMaxLength * maxItems) + Math.max(0, maxItems - 1)),
        name,
        rows: "4"
      }
    });
    textarea.value = Array.isArray(values) ? values.join("\n") : "";
    const addButton = createElement("button", {
      documentRef,
      text: "Добавить строку",
      attributes: {
        type: "button"
      },
      on: {
        click: () => {
          textarea.value = `${textarea.value}${textarea.value.length > 0 ? "\n" : ""}`;
          textarea.focus();
        }
      }
    });
    const removeButton = createElement("button", {
      documentRef,
      text: "Убрать пустые",
      attributes: {
        type: "button"
      },
      on: {
        click: () => {
          textarea.value = textarea.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).join("\n");
        }
      }
    });

    return createElement("label", {
      documentRef,
      className: "admin-field admin-array-field",
      children: [
        createElement("span", { documentRef, text: label }),
        textarea,
        createElement("span", {
          documentRef,
          className: "admin-array-actions",
          children: [addButton, removeButton]
        }),
        renderFieldErrors(name, errors)
      ]
    });
  }

  function createCategoryField(errors) {
    const select = createElement("select", {
      documentRef,
      attributes: {
        "aria-describedby": fieldErrorId("categoryId"),
        name: "categoryId",
        required: true
      },
      children: categories.map((category) => createElement("option", {
        documentRef,
        text: category.title ?? category.slug ?? category.id,
        attributes: {
          value: category.id
        }
      }))
    });

    select.value = readValue("categoryId") || categories[0]?.id || "";

    return createElement("label", {
      documentRef,
      className: "admin-field",
      children: [
        createElement("span", { documentRef, text: "Категория" }),
        select,
        renderFieldErrors("categoryId", errors)
      ]
    });
  }

  function renderFieldErrors(name, errors) {
    return createElement("span", {
      documentRef,
      className: "admin-field-error",
      attributes: {
        "aria-live": "polite",
        "data-field-error": name,
        id: fieldErrorId(name),
        role: "alert"
      },
      text: (errors?.[name] ?? []).join(" ")
    });
  }

  function renderErrorStatus(error) {
    const children = [
      createElement("span", {
        documentRef,
        text: safeMessage(error)
      })
    ];

    if (typeof error?.requestId === "string") {
      children.push(createRequestIdControl(error.requestId, { documentRef }));
    }

    replaceContent(statusRegion, ...children);
    onStatus(safeMessage(error));
  }

  function renderScreenError(error) {
    replaceContent(formHost, createElement("p", {
      documentRef,
      className: "admin-state admin-state-error",
      text: safeMessage(error)
    }));
    renderErrorStatus(error);
  }

  return {
    destroy,
    element,
    load
  };

  function readValue(fieldName) {
    const value = lastFormState[fieldName] ?? currentSite?.[fieldName] ?? "";

    return value === null || value === undefined ? "" : value;
  }

  function readArrayValue(fieldName) {
    const value = lastFormState[fieldName] ?? currentSite?.[fieldName] ?? [];

    return Array.isArray(value) ? value : String(value).split(/\r?\n/);
  }

  function readDemoModeValue() {
    const value = lastFormState.demoMode ?? currentSite?.demoMode ?? "none";

    return value === "external-iframe" ? "external-iframe" : "none";
  }
}

function buildFieldAttributes(name, kind, attributes) {
  const type = attributes.type ?? (URL_FIELDS.has(name) ? "url" : "text");
  const nextAttributes = {
    "aria-describedby": fieldErrorId(name),
    autocomplete: URL_FIELDS.has(name) ? "url" : "off",
    name
  };
  const maxLength = FIELD_MAX_LENGTHS[name];

  if (kind !== "textarea") {
    nextAttributes.type = type;
  }
  if (maxLength !== undefined) {
    nextAttributes.maxlength = String(maxLength);
  }
  if (REQUIRED_FIELDS.has(name)) {
    nextAttributes.required = true;
  }
  if (type === "number") {
    nextAttributes.inputmode = "numeric";
    nextAttributes.step = "1";
    if (attributes.min !== undefined) {
      nextAttributes.min = attributes.min;
    }
    if (attributes.max !== undefined) {
      nextAttributes.max = attributes.max;
    }
  }

  return nextAttributes;
}

function fieldErrorId(name) {
  return `admin-field-error-${name}`;
}

function readFormState(form) {
  const state = {};

  for (const field of form.querySelectorAll("[name]")) {
    if (field.type === "checkbox") {
      state[field.name] = field.checked;
      continue;
    }

    state[field.name] = field.value;
  }

  return state;
}

function sitePath(siteId) {
  if (typeof siteId !== "string" || !UUID_PATTERN.test(siteId)) {
    throw new Error("Invalid site id.");
  }

  return `/api/admin/sites/${siteId}`;
}

function safeMessage(error) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Не удалось сохранить.";
}
