import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  focusFirstInvalid,
  replaceContent,
  setBusy
} from "../dom.js";
import {
  appendSlugTimestamp,
  DB_INT_MAX,
  FormValidationError,
  SITE_LIMITS,
  buildCreateSitePayload,
  buildUpdateSitePayload,
  formatCentsToRubles,
  generateSiteSlug,
  mapValidationDetails
} from "../forms.js";
import {
  buildSiteFormDraftKey,
  readSiteFormDraft,
  removeSiteFormDraft,
  resolveSiteFormDraftStorage,
  writeSiteFormDraft
} from "../site-form-drafts.js";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const READY_PATH = "/api/ready";
const DRAFT_AUTOSAVE_MS = 1000;
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
  demoUrlSimple: SITE_LIMITS.url,
  demoUrl: SITE_LIMITS.url,
  externalDemoUrl: SITE_LIMITS.url,
  fullDescription: SITE_LIMITS.fullDescription,
  legacyTitle: SITE_LIMITS.legacyTitle,
  originalDemoUrl: SITE_LIMITS.url,
  previewType: SITE_LIMITS.previewType,
  priceRubles: SITE_LIMITS.priceRubles,
  priceLabel: SITE_LIMITS.priceLabel,
  shortDescription: SITE_LIMITS.shortDescription,
  siteUrl: SITE_LIMITS.url,
  slug: SITE_LIMITS.slug,
  title: SITE_LIMITS.title
});
const URL_FIELDS = new Set(["demoLocalUrl", "demoUrl", "demoUrlSimple", "externalDemoUrl", "originalDemoUrl", "siteUrl"]);
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
  const storage = resolveSiteFormDraftStorage(options?.storage);
  const draftKey = buildSiteFormDraftKey({ mode, siteId });
  const draftAutosaveMs = Number.isFinite(options?.draftAutosaveMs) ? options.draftAutosaveMs : DRAFT_AUTOSAVE_MS;
  const windowRef = options?.windowRef ?? documentRef.defaultView ?? null;
  let activeController = null;
  let busy = false;
  let destroyed = false;
  let currentSite = null;
  let categories = [];
  let lastFormState = {};
  let pendingDraft = null;
  let draftSaveTimer = null;
  let dirty = false;
  let networkOnline = windowRef?.navigator?.onLine !== false;
  let slugManuallyEdited = mode !== "create";
  let updatingSlug = false;

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

  registerNetworkListeners();

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
      pendingDraft = readSiteFormDraft(storage, draftKey);
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
    clearDraftSaveTimer();
    unregisterNetworkListeners();
    unregisterDirtyGuard();
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
    replaceContent(formHost, ...(pendingDraft === null ? [form] : [createDraftRecoveryBanner(), form]));
  }

  function createForm(errors) {
    const form = createElement("form", {
      documentRef,
      className: "admin-editor-form",
      attributes: {
        "data-save-state": "idle"
      },
      children: [
        createBasicSection(errors),
        createDemoSection(errors),
        createCatalogSection(errors),
        createCommercialSection(errors),
        createAdvancedSection(errors),
        ...(role === "admin" && mode === "edit" ? [createAdminSection(errors)] : []),
        createActions()
      ]
    });

    form.addEventListener("input", (event) => {
      handleFormInput(form, event);
    });
    form.addEventListener("change", () => {
      syncDemoUrlVisibility(form);
      scheduleDraftSave(form);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) {
        return;
      }

      const submitButton = form.querySelector('[data-action="save-site"]');
      busy = true;
      setBusy(submitButton, true);
      setSaveState(form, "validating");
      let formState = {};

      try {
        formState = readFormState(form);
        lastFormState = formState;
        const payload = mode === "create"
          ? buildCreateSitePayload(formState)
          : buildUpdateSitePayload(formState, role);
        if (!networkOnline) {
          renderForm({
            _form: ["Соединение нестабильно. Форма сохранена локально."]
          });
          statusRegion.textContent = "Соединение нестабильно. Форма сохранена локально.";
          onStatus("Соединение нестабильно. Форма сохранена локально.");
          return;
        }
        setSaveState(form, "warmingBackend");
        await ensureBackendReady();
        setSaveState(form, "saving");
        const response = await apiClient.requestJson(
          mode === "create" ? "/api/admin/sites" : sitePath(siteId),
          {
            body: payload,
            headers: {
              "X-Request-Id": createClientRequestId()
            },
            method: mode === "create" ? "POST" : "PATCH"
          }
        );
        finishSuccessfulSave(response?.data ?? null, form, "Сохранено.");
      } catch (error) {
        if (await handleNetworkFailure(error, formState, form)) {
          return;
        }
        const mapped = localizeEditorErrors(error instanceof FormValidationError
          ? mapValidationDetails(error.details)
          : mapValidationDetails(error?.details), formState);
        const nextErrors = Object.keys(mapped).length === 0 ? { _form: [safeMessage(error)] } : mapped;

        if (isSlugConflict(error) && nextErrors.slug === undefined && formState.slug !== undefined) {
          nextErrors.slug = [
            `Адрес карточки уже занят. Можно попробовать: ${appendSlugTimestamp(formState.slug)}.`
          ];
        }

        setSaveState(form, saveStateForError(error));
        renderForm(nextErrors);
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

  function finishSuccessfulSave(saved, form, message) {
    currentSite = saved;
    dirty = false;
    clearDraft();
    unregisterDirtyGuard();
    statusRegion.textContent = message;
    onStatus(message);

    if (mode === "create" && typeof saved?.id === "string") {
      renderCreateSavedNextStep(saved);
      onSaved(saved);
      return;
    }

    setSaveState(form, "saved");
    onSaved(saved);
  }

  function renderCreateSavedNextStep(saved) {
    const actions = [
      createElement("button", {
        documentRef,
        text: "Перейти к изображениям",
        attributes: {
          "data-action": "manage-images",
          type: "button"
        },
        on: {
          click: () => onImages(saved.id)
        }
      }),
      createElement("button", {
        documentRef,
        text: "К списку",
        attributes: {
          "data-action": "back-to-sites",
          type: "button"
        },
        on: {
          click: onCancel
        }
      })
    ];

    replaceContent(formHost, createElement("section", {
      documentRef,
      className: "admin-save-next-step",
      attributes: {
        "data-save-state": "saved"
      },
      children: [
        createElement("p", {
          documentRef,
          className: "admin-kicker",
          text: "Черновик"
        }),
        createElement("h3", {
          documentRef,
          text: "Черновик сохранён"
        }),
        createElement("div", {
          documentRef,
          className: "admin-save-next-actions",
          children: actions
        })
      ]
    }));
  }

  function createBasicSection(errors) {
    const children = [
      createField("title", "Название сайта", "input", errors, readValue("title")),
      createCategoryField(errors),
      createField("shortDescription", "Короткое описание", "textarea", errors, readValue("shortDescription")),
      createField("fullDescription", "Полное описание", "textarea", errors, readValue("fullDescription"))
    ];

    return createSection("Основное", children);
  }

  function createDemoSection(errors) {
    return createSection("Демо", [
      createDemoModeField(errors),
      createField("demoUrlSimple", "Ссылка на демо", "input", errors, readDemoUrlSimpleValue(), {
        "data-demo-url-field": "true",
        hidden: readDemoModeValue() === "external-iframe" ? undefined : true
      })
    ]);
  }

  function createCatalogSection(errors) {
    return createSection("Каталог", [
      createArrayField("features", "Особенности", errors, readArrayValue("features")),
      createArrayField("tags", "Теги", errors, readArrayValue("tags"))
    ]);
  }

  function createCommercialSection(errors) {
    return createSection("Коммерция", [
      createField("priceRubles", "Цена, ₽", "input", errors, readPriceRublesValue(), {
        inputmode: "decimal",
        maxlength: String(SITE_LIMITS.priceRubles),
        type: "text"
      }),
      createField("priceLabel", "Метка цены", "input", errors, readValue("priceLabel")),
      createField("developmentDays", "Дней разработки", "input", errors, readValue("developmentDays"), {
        max: String(DB_INT_MAX),
        type: "number"
      }),
      createField("deliveryLabel", "Текст срока", "input", errors, readValue("deliveryLabel"))
    ]);
  }

  function createAdvancedSection(errors) {
    return createElement("details", {
      documentRef,
      className: "admin-editor-section admin-editor-advanced",
      attributes: {
        "data-section": "advanced-site-settings"
      },
      children: [
        createElement("summary", {
          documentRef,
          text: "Расширенные настройки"
        }),
        ...(mode === "create" || role === "admin" ? [createSlugField(errors)] : []),
        createField("previewType", "previewType", "input", errors, readValue("previewType"), {
          "data-advanced-field": "true"
        }),
        createField("sortOrder", "sortOrder", "input", errors, readValue("sortOrder"), {
          "data-advanced-field": "true",
          max: String(DB_INT_MAX),
          min: "0",
          type: "number"
        }),
        createField("legacyTitle", "legacyTitle", "input", errors, readValue("legacyTitle"), {
          "data-advanced-field": "true"
        }),
        createField("siteUrl", "siteUrl", "input", errors, readValue("siteUrl"), {
          "data-advanced-field": "true"
        }),
        createField("demoUrl", "demoUrl", "input", errors, readValue("demoUrl"), {
          "data-advanced-field": "true"
        }),
        createField("demoLocalUrl", "demoLocalUrl", "input", errors, readValue("demoLocalUrl"), {
          "data-advanced-field": "true"
        }),
        createField("externalDemoUrl", "externalDemoUrl", "input", errors, readValue("externalDemoUrl"), {
          "data-advanced-field": "true"
        }),
        createField("originalDemoUrl", "originalDemoUrl", "input", errors, readValue("originalDemoUrl"), {
          "data-advanced-field": "true"
        })
      ]
    });
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

  function createSlugField(errors) {
    const field = createField("slug", "Адрес карточки", "input", errors, readSlugValue(), {
      helpText: "Создаётся автоматически. Менять обычно не нужно."
    });
    const regenerate = createElement("button", {
      documentRef,
      text: "Сгенерировать заново",
      attributes: {
        "data-action": "regenerate-slug",
        type: "button"
      },
      on: {
        click: () => {
          const form = formHost.querySelector("form");

          if (form === null) {
            return;
          }

          slugManuallyEdited = false;
          updateSlugFromTitle(form);
          scheduleDraftSave(form);
        }
      }
    });

    field.append(regenerate);

    return field;
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
        createElement("span", { documentRef, text: "Есть демо?" }),
        select,
        createElement("span", {
          documentRef,
          className: "admin-field-help",
          attributes: { id: hintId },
          text: "Выберите “Без демо”, если отдельной рабочей ссылки нет."
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
    const { helpText, ...htmlAttributes } = attributes;
    const fieldAttributes = buildFieldAttributes(name, kind, htmlAttributes);
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
        ...(typeof helpText === "string" && helpText.length > 0
          ? [
              createElement("span", {
                documentRef,
                className: "admin-field-help",
                text: helpText
              })
            ]
          : []),
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

  function createDraftRecoveryBanner() {
    return createElement("div", {
      documentRef,
      className: "admin-draft-recovery",
      attributes: {
        role: "status"
      },
      children: [
        createElement("span", {
          documentRef,
          text: "Найдены несохранённые данные. Восстановить?"
        }),
        createElement("button", {
          documentRef,
          text: "Восстановить",
          attributes: {
            "data-action": "restore-site-draft",
            type: "button"
          },
          on: {
            click: () => {
              lastFormState = { ...pendingDraft?.fields };
              pendingDraft = null;
              dirty = true;
              renderForm({});
            }
          }
        }),
        createElement("button", {
          documentRef,
          text: "Удалить черновик",
          attributes: {
            "data-action": "discard-site-draft",
            type: "button"
          },
          on: {
            click: () => {
              clearDraft();
              pendingDraft = null;
              renderForm({});
            }
          }
        })
      ]
    });
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
    isMutationBusy: () => busy,
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

  function readSlugValue() {
    if (lastFormState.slug !== undefined) {
      return lastFormState.slug;
    }
    if (currentSite?.slug !== undefined) {
      return currentSite.slug;
    }

    return mode === "create" ? generateSiteSlug(lastFormState.title ?? "") : "";
  }

  function readDemoUrlSimpleValue() {
    return lastFormState.demoUrlSimple ??
      currentSite?.externalDemoUrl ??
      currentSite?.demoUrl ??
      currentSite?.originalDemoUrl ??
      "";
  }

  function readPriceRublesValue() {
    if (lastFormState.priceRubles !== undefined) {
      return lastFormState.priceRubles;
    }

    return formatCentsToRubles(currentSite?.priceAmountCents);
  }

  function handleFormInput(form, event) {
    const target = event?.target;

    if (target?.name === "slug" && !updatingSlug) {
      slugManuallyEdited = true;
    }
    if (target?.name === "title" && mode === "create" && !slugManuallyEdited) {
      updateSlugFromTitle(form);
    }

    syncDemoUrlVisibility(form);
    scheduleDraftSave(form);
  }

  function updateSlugFromTitle(form) {
    const title = form.querySelector('[name="title"]');
    const slug = form.querySelector('[name="slug"]');

    if (title === null || slug === null) {
      return;
    }

    updatingSlug = true;
    slug.value = generateSiteSlug(title.value);
    updatingSlug = false;
  }

  function syncDemoUrlVisibility(form) {
    const demoMode = form.querySelector('[name="demoMode"]');
    const demoUrl = form.querySelector('[data-demo-url-field="true"]');

    if (demoUrl === null) {
      return;
    }
    if (demoMode?.value === "external-iframe") {
      demoUrl.removeAttribute("hidden");
    } else {
      demoUrl.setAttribute("hidden", "true");
    }
  }

  function scheduleDraftSave(form) {
    dirty = true;
    registerDirtyGuard();
    clearDraftSaveTimer();
    draftSaveTimer = setTimeout(() => {
      persistDraft(form);
    }, draftAutosaveMs);
  }

  function persistDraft(form) {
    writeSiteFormDraft(storage, draftKey, {
      fields: readFormState(form),
      routeType: mode,
      siteId: mode === "edit" ? siteId : null,
      temporaryClientId: mode === "create" ? "new" : null,
      updatedAt: new Date().toISOString()
    });
  }

  function clearDraft() {
    clearDraftSaveTimer();
    removeSiteFormDraft(storage, draftKey);
  }

  function clearDraftSaveTimer() {
    if (draftSaveTimer !== null) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
  }

  function registerDirtyGuard() {
    if (windowRef === null || typeof windowRef.addEventListener !== "function") {
      return;
    }
    windowRef.removeEventListener?.("beforeunload", handleBeforeUnload);
    windowRef.addEventListener("beforeunload", handleBeforeUnload);
  }

  function unregisterDirtyGuard() {
    windowRef?.removeEventListener?.("beforeunload", handleBeforeUnload);
  }

  function registerNetworkListeners() {
    windowRef?.addEventListener?.("offline", handleOffline);
    windowRef?.addEventListener?.("online", handleOnline);
  }

  function unregisterNetworkListeners() {
    windowRef?.removeEventListener?.("offline", handleOffline);
    windowRef?.removeEventListener?.("online", handleOnline);
  }

  function handleOffline() {
    networkOnline = false;
    statusRegion.textContent = "Соединение нестабильно. Форма сохранена локально.";
    onStatus("Соединение нестабильно. Форма сохранена локально.");
  }

  function handleOnline() {
    networkOnline = true;
    statusRegion.textContent = "Соединение восстановлено. Можно повторить сохранение.";
    onStatus("Соединение восстановлено. Можно повторить сохранение.");
  }

  function handleBeforeUnload(event) {
    if (!dirty) {
      return;
    }

    event.preventDefault?.();
    event.returnValue = "";
  }

  async function ensureBackendReady() {
    await apiClient.requestJson(READY_PATH, {
      auth: false,
      method: "GET"
    });
  }

  async function handleNetworkFailure(error, formState, form) {
    if (!isNetworkFailure(error) || mode !== "create") {
      return false;
    }

    setSaveState(form, "verifyingAfterNetworkFailure");
    statusRegion.textContent = "Проверяем, сохранилась ли запись...";
    onStatus("Проверяем, сохранилась ли запись...");

    try {
      const slug = String(formState.slug ?? "").trim();
      const response = await apiClient.requestJson(
        `/api/admin/sites?search=${encodeURIComponent(slug)}&deleted=without`,
        { method: "GET" }
      );
      const saved = (Array.isArray(response?.data) ? response.data : [])
        .find((site) => site?.slug === slug) ?? null;

      if (saved !== null) {
        finishSuccessfulSave(saved, form, "Сохранено. Запись найдена после проверки.");
        return true;
      }
    } catch {
      // Verification is best-effort; the local form draft is preserved either way.
    }

    setSaveState(form, "failedNetwork");
    renderForm({
      _form: ["Сервер не ответил. Запись не найдена. Можно повторить."]
    });
    statusRegion.textContent = "Сервер не ответил. Запись не найдена. Можно повторить.";
    onStatus("Сервер не ответил. Запись не найдена. Можно повторить.");
    return true;
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
  if (attributes.inputmode !== undefined) {
    nextAttributes.inputmode = attributes.inputmode;
  }
  if (attributes.maxlength !== undefined) {
    nextAttributes.maxlength = attributes.maxlength;
  }
  if (attributes["data-advanced-field"] !== undefined) {
    nextAttributes["data-advanced-field"] = attributes["data-advanced-field"];
  }
  if (attributes["data-demo-url-field"] !== undefined) {
    nextAttributes["data-demo-url-field"] = attributes["data-demo-url-field"];
  }
  if (attributes.hidden === true) {
    nextAttributes.hidden = "true";
  }

  return nextAttributes;
}

function fieldErrorId(name) {
  return `admin-field-error-${name}`;
}

function readFormState(form) {
  const state = {};

  for (const field of form.querySelectorAll("[name]")) {
    if (field.getAttribute?.("data-advanced-field") === "true" && !isInsideOpenDetails(field)) {
      continue;
    }
    if (field.type === "checkbox") {
      state[field.name] = field.checked;
      continue;
    }

    state[field.name] = field.value;
  }

  return state;
}

function isInsideOpenDetails(field) {
  let current = field.parentNode;

  while (current !== null && current !== undefined) {
    if (current.tagName === "details") {
      return typeof current.hasAttribute === "function"
        ? current.hasAttribute("open")
        : current.getAttribute?.("open") !== null;
    }
    current = current.parentNode;
  }

  return false;
}

function setSaveState(form, state) {
  form?.setAttribute?.("data-save-state", state);
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

function localizeEditorErrors(errors, formState) {
  const localized = { ...errors };

  if (Array.isArray(localized.slug)) {
    localized.slug = localized.slug.map((message) => localizeSlugError(message, formState?.slug));
  }

  return localized;
}

function localizeSlugError(message, slug) {
  if (/already exists|conflict|duplicate|taken|unique/i.test(String(message))) {
    return `Адрес карточки уже занят. Можно попробовать: ${appendSlugTimestamp(slug)}.`;
  }
  if (/lowercase|hyphens?|letters|numbers|slug/i.test(String(message))) {
    return "Адрес карточки может содержать только латинские буквы, цифры и дефисы.";
  }

  return String(message).replace(/\b[Ss]lug\b/g, "Адрес карточки");
}

function isNetworkFailure(error) {
  return error?.code === "NETWORK_ERROR" || error?.code === "REQUEST_ABORTED" || error?.status === 0;
}

function isSlugConflict(error) {
  return error?.code === "SLUG_CONFLICT" || error?.status === 409;
}

function saveStateForError(error) {
  if (error instanceof FormValidationError || error?.status === 400) {
    return "failedValidation";
  }
  if (error?.status === 401 || error?.code === "UNAUTHORIZED" || /^REFRESH_/.test(String(error?.code ?? ""))) {
    return "authExpired";
  }
  if (isNetworkFailure(error)) {
    return "failedNetwork";
  }

  return "failedServer";
}

function createClientRequestId() {
  const random = globalThis.crypto?.randomUUID?.();

  return typeof random === "string"
    ? `req_${random}`
    : `req_${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
