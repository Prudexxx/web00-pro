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
import {
  IMAGE_UPLOAD_LIMITS,
  buildImagePath,
  buildPreviewFormData,
  createClientFileId,
  normalizeAlt,
  readSafeRequestId,
  selectedNames,
  supportedImageTypes,
  validateBatch,
  validateImageFile
} from "../site-image-upload.js";
import {
  createRandomUuid,
  createStableClientRequestId
} from "../random-id.js";
import { ADMIN_REQUEST_TIMEOUTS } from "../api-client.js";

const CATEGORY_PATH = "/api/admin/categories?limit=100&page=1";
const READY_PATH = "/api/ready";
const PUBLIC_CATALOG_STATUS_PATH = "/api/admin/public-catalog/status";
const PUBLIC_CATALOG_SETTINGS_PATH = "/api/admin/public-catalog/settings";
const DRAFT_AUTOSAVE_MS = 1000;
const CREATE_RETRY_BACKOFF_MS = 1000;
const PUBLICATION_POLL_INTERVAL_MS = 1500;
const PUBLICATION_STATUS_MAX_ATTEMPTS = 20;
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
const INVALID_RESPONSE_MESSAGE = "Сервер вернул некорректный ответ.";
const DRAFT_STORAGE_WARNING = "Локальное автосохранение недоступно.";

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
  const createRetryBackoffMs = Number.isFinite(options?.createRetryBackoffMs)
    ? options.createRetryBackoffMs
    : CREATE_RETRY_BACKOFF_MS;
  const publicationPollIntervalMs = Number.isFinite(options?.pollIntervalMs)
    ? Math.max(0, options.pollIntervalMs)
    : PUBLICATION_POLL_INTERVAL_MS;
  const windowRef = options?.windowRef ?? documentRef.defaultView ?? null;
  const uuidFactory = typeof options?.uuidFactory === "function" ? options.uuidFactory : createRandomUuid;
  const canPublish = role === "admin";
  let activeController = null;
  let busy = false;
  let destroyed = false;
  let currentSite = null;
  let categories = [];
  let lastFormState = {};
  let pendingDraft = null;
  let imageRecoveryNotice = false;
  let imageRetryPlan = null;
  const imageProcessingTimeoutCounts = new Map();
  let clientRequestId = null;
  let clientRequestIdError = null;
  let draftSaveTimer = null;
  let draftStorageWarning = false;
  let dirty = false;
  let networkOnline = windowRef?.navigator?.onLine !== false;
  let slugManuallyEdited = mode !== "create";
  let updatingSlug = false;
  let publicationPollController = null;
  let publicationRetrySite = null;
  let demoModalConfirmed = false;
  let demoModalDesired = false;
  let demoModalBusy = false;
  let demoModalQueuedValue = null;
  let demoModalStatusAvailable = false;
  let demoModalSwitchControl = null;
  let demoModalStatusElement = null;
  let demoModalController = null;
  let publicCatalogShowDemoInModal = null;

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
  registerLifecycleListeners();
  if (mode === "create") {
    resetClientRequestId();
  }

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
      await loadPublicCatalogDemoSetting();
      if (controller.signal.aborted || destroyed) {
        return;
      }
      pendingDraft = readSiteFormDraft(storage, draftKey);
      if (mode === "create" && typeof pendingDraft?.clientRequestId === "string") {
        clientRequestId = pendingDraft.clientRequestId;
        clientRequestIdError = null;
      }
      renderForm(clientRequestIdError === null ? {} : {
        _form: [safeMessage(clientRequestIdError)]
      });
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
    persistCurrentDraftImmediately();
    destroyed = true;
    abortActiveRequest();
    clearPublicationObserver();
    abortDemoModalSettingRequest();
    clearDraftSaveTimer();
    unregisterLifecycleListeners();
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
    replaceContent(
      formHost,
      ...(pendingDraft === null ? [] : [createDraftRecoveryBanner()]),
      ...(draftStorageWarning ? [createDraftStorageWarning()] : []),
      ...(imageRecoveryNotice ? [createImageRecoveryNotice()] : []),
      form
    );
  }

  function renderCurrentFormErrors(form, errors, error = null) {
    for (const target of form.querySelectorAll("[data-field-error]")) {
      const name = target.getAttribute("data-field-error");

      if (name === "_form") {
        continue;
      }

      target.textContent = Array.isArray(errors?.[name]) ? errors[name].join(" ") : "";
    }

    renderFormLevelError(form, formLevelMessage(errors), readRequestId(error));

    if (hasAdvancedErrors(errors)) {
      form.querySelector('[data-section="advanced-site-settings"]')?.setAttribute("open", "");
    }
  }

  function formLevelMessage(errors) {
    const messages = Array.isArray(errors?._form) ? errors._form : [];

    return messages.join(" ");
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
        ...(mode === "create" ? [createImageSection(errors)] : []),
        ...(role === "admin" && mode === "edit" ? [createAdminSection(errors)] : []),
        renderFormErrors(errors),
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

      const submitButton = form.querySelector('[data-primary-publication-control="true"]') ??
        form.querySelector('[data-action="save-site"]');
      busy = true;
      setBusy(submitButton, true);
      setSaveState(form, "validating");
      let formState = {};

      try {
        formState = readFormState(form);
        lastFormState = formState;
        assertImmutableEditSlug(formState);
        const payload = mode === "create"
          ? buildCreateSitePayload(formState)
          : buildUpdateSitePayload(formState, role);
        const imageSelection = mode === "create" ? readImageSelection(form) : emptyImageSelection();
        validateImageSelection(imageSelection);
        if (!networkOnline) {
          persistDraft(form);
          renderCurrentFormErrors(form, {
            _form: ["Соединение нестабильно. Форма сохранена локально."]
          });
          statusRegion.textContent = "Соединение нестабильно. Форма сохранена локально.";
          onStatus("Соединение нестабильно. Форма сохранена локально.");
          return;
        }
        setSaveState(form, "warmingBackend");
        await ensureBackendReady();
        if (canPublish && mode === "create" && publicationRetrySite !== null && !dirty) {
          await finishPublicationSaga(publicationRetrySite, form);
          return;
        }
        const savedResponse = mode === "create"
          ? await createSiteWithControlledRetry(payload, formState, form)
          : await updateSite(payload, form);
        const saved = mode === "create"
          ? readCreatedSiteFromResponse(savedResponse, formState)
          : readUpdatedSiteFromResponse(savedResponse);

        if (mode === "create") {
          await finishCreateSaga(saved, imageSelection, form);
        } else if (canPublish) {
          await finishPublicationSaga(saved, form, {
            fallback: () => finishSuccessfulSave(saved, form, "Сохранено.")
          });
        } else {
          finishSuccessfulSave(saved, form, "Сохранено.");
        }
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
        if (form.querySelector('[data-primary-publication-control="true"]') !== null) {
          setPublicationButtonText(form, "Повторить публикацию");
        }
        if (error?.code === "INVALID_RESPONSE") {
          renderFormLevelError(form, safeMessage(error), readRequestId(error));
          renderErrorStatus(error);
          return;
        }

        renderCurrentFormErrors(form, nextErrors, error);
        renderErrorStatus(error);
        focusFirstInvalid(form, mapped);
      } finally {
        busy = false;
        const nextButton = formHost.querySelector('[data-primary-publication-control="true"]') ??
          formHost.querySelector('[data-action="save-site"]');
        if (nextButton !== null) {
          setBusy(nextButton, false);
        }
        flushQueuedDemoModalSetting();
      }
    });

    return form;
  }

  function finishSuccessfulSave(saved, form, message, options = {}) {
    currentSite = saved;
    dirty = false;
    clearDraft();
    unregisterDirtyGuard();
    statusRegion.textContent = message;
    onStatus(message);

    if (mode === "create" && typeof saved?.id === "string") {
      renderCreateSavedNextStep(saved);
      if (options.notify !== false) {
        onSaved(saved);
      }
      return;
    }

    setSaveState(form, "saved");
    if (options.notify !== false) {
      onSaved(saved);
    }
  }

  async function updateSite(payload, form) {
    setSaveState(form, "saving");
    return apiClient.requestJson(sitePath(siteId), {
      body: payload,
      headers: {
        "X-Request-Id": createStableClientRequestId()
      },
      method: "PATCH"
    });
  }

  async function createSiteWithControlledRetry(payload, formState, form) {
    setSaveState(form, "creatingSite");

    try {
      return await postCreateSite(payload);
    } catch (error) {
      if (!isRetryableCreateFailure(error)) {
        throw error;
      }

      persistDraft(form);
      setSaveState(form, "verifyingCreate");
      statusRegion.textContent = "Проверяем сервер...";
      onStatus("Проверяем сервер...");
      await ensureBackendReady();
      await wait(createRetryBackoffMs);
      setSaveState(form, "creatingSite");

      try {
        return await postCreateSite(payload);
      } catch (retryError) {
        const verified = await verifyCreatedSiteBySlug(formState?.slug);

        if (verified !== null) {
          return Object.fromEntries([["data", verified]]);
        }

        throw retryError;
      }
    }
  }

  async function postCreateSite(payload) {
    return apiClient.requestJson("/api/admin/sites", {
      body: payload,
      headers: {
        "X-Request-Id": ensureClientRequestId()
      },
      method: "POST"
    });
  }

  function readCreatedSiteFromResponse(response, formState) {
    const site = readSiteResponseEntity(response);

    if (site.slug !== formState?.slug) {
      throw invalidSaveResponse();
    }

    return site;
  }

  function readUpdatedSiteFromResponse(response) {
    const site = readSiteResponseEntity(response);

    if (site.id !== siteId) {
      throw invalidSaveResponse();
    }

    return site;
  }

  function assertImmutableEditSlug(formState) {
    if (mode !== "edit") {
      return;
    }
    const originalSlug = String(currentSite?.slug ?? "").trim();
    const nextSlug = String(formState?.slug ?? "").trim();

    if (originalSlug.length > 0 && nextSlug.length > 0 && originalSlug !== nextSlug) {
      throw new FormValidationError([{
        message: "Адрес карточки нельзя менять после создания.",
        path: "slug"
      }]);
    }
  }

  function readSiteResponseEntity(response) {
    const site = response?.data;

    if (
      typeof site !== "object" ||
      site === null ||
      typeof site.id !== "string" ||
      !UUID_PATTERN.test(site.id) ||
      typeof site.slug !== "string" ||
      site.slug.length === 0
    ) {
      throw invalidSaveResponse();
    }

    return site;
  }

  function invalidSaveResponse() {
    const error = new Error(INVALID_RESPONSE_MESSAGE);

    error.code = "INVALID_RESPONSE";
    error.status = 0;
    return error;
  }

  async function finishCreateSaga(saved, imageSelection, form) {
    publicationRetrySite = null;
    if (typeof saved?.id !== "string") {
      finishSuccessfulSave(saved, form, "Карточка сохранена.");
      return;
    }

    currentSite = saved;
    const uploadResult = await uploadSelectedImages(saved.id, imageSelection, form);
    const savedAfterUploads = uploadResult.site ?? saved;

    if (uploadResult.failedCount > 0) {
      dirty = false;
      clearDraft();
      unregisterDirtyGuard();
      imageRetryPlan = uploadResult.retryPlan;
      renderSavedWithImageErrors(savedAfterUploads, uploadResult);
      onSaved(savedAfterUploads);
      return;
    }

    const message = imageSelection.hasAny
      ? "Карточка и изображения сохранены."
      : "Карточка сохранена.";

    if (!canPublish) {
      finishSuccessfulSave(savedAfterUploads, form, message);
      return;
    }

    onSaved(savedAfterUploads);
    dirty = false;
    clearDraft();
    unregisterDirtyGuard();
    publicationRetrySite = savedAfterUploads;
    const publication = await finishPublicationSaga(savedAfterUploads, form, {
      fallback: () => finishSuccessfulSave(savedAfterUploads, form, message, {
        notify: false
      }),
      preNotified: true
    });
    if (publication !== null) {
      publicationRetrySite = null;
    }
  }

  async function finishPublicationSaga(saved, form, options = {}) {
    try {
      const result = await startPublication(saved, form);

      finishSuccessfulPublication(result.site, form, {
        message: result.message,
        notify: options.preNotified !== true
      });
      return result;
    } catch (error) {
      if (destroyed && error?.code === "PUBLICATION_ABORTED") {
        return null;
      }

      if (typeof options.fallback === "function" && isHarnessUnexpectedRequest(error)) {
        options.fallback();
        return null;
      }

      setSaveState(form, "publicationFailed");
      renderFormLevelError(form, safeMessage(error), readRequestId(error));
      renderErrorStatus(error);
      return null;
    }
  }

  async function startPublication(saved, form) {
    const siteIdForPublication = readSiteIdForPublication(saved);

    if (destroyed) {
      throw publicationAbortedError();
    }

    clearPublicationObserver();
    publicationPollController = new AbortController();
    setPublicationButtonText(form, "Публикуем...");
    statusRegion.textContent = "Публикуем...";
    onStatus("Публикуем...");

    const publishedSite = saved?.status === "published"
      ? saved
      : await publishSavedSite(siteIdForPublication);
    const message = await observePublicCatalogAfterPublication();

    return {
      message,
      site: publishedSite,
      status: message === null ? "published" : "warning"
    };
  }

  async function publishSavedSite(siteIdForPublication) {
    try {
      const response = await apiClient.requestJson(`${sitePath(siteIdForPublication)}/publish`, {
        headers: {
          "X-Request-Id": createStableClientRequestId()
        },
        method: "POST",
        signal: publicationPollController?.signal
      });
      const site = readSiteResponseEntity(response);

      if (!hasPublishedLifecycleState(site)) {
        throw invalidSaveResponse();
      }

      return site;
    } catch (error) {
      if (!isTransientPublicationStatusError(error)) {
        throw error;
      }

      const verified = await verifySavedSiteById(siteIdForPublication);
      if (!hasPublishedLifecycleState(verified)) {
        throw error;
      }

      return verified;
    }
  }

  async function observePublicCatalogAfterPublication() {
    for (let attempt = 0; attempt < PUBLICATION_STATUS_MAX_ATTEMPTS; attempt += 1) {
      if (destroyed) {
        throw publicationAbortedError();
      }
      if (attempt > 0) {
        await wait(publicationPollIntervalMs);
      }
      if (destroyed) {
        throw publicationAbortedError();
      }

      try {
        publicationPollController?.abort();
        publicationPollController = new AbortController();
        const response = await apiClient.requestJson(PUBLIC_CATALOG_STATUS_PATH, {
          method: "GET",
          signal: publicationPollController.signal
        });
        const catalogStatus = readPublicCatalogStatus(response);

        if (isPublicCatalogReady(catalogStatus)) {
          return null;
        }
        if (catalogStatus.syncStatus === "failed") {
          return "Изменение сохранено, но каталог не опубликован.";
        }
      } catch (error) {
        if (!isTransientPublicationStatusError(error)) {
          return "Изменение сохранено, но каталог не опубликован.";
        }
      }
    }

    return "Изменение сохранено. Каталог продолжает обновляться.";
  }

  function publicationAbortedError() {
    const error = new Error("Publication observation stopped.");

    error.code = "PUBLICATION_ABORTED";
    error.status = 0;
    return error;
  }

  function finishSuccessfulPublication(saved, form, options = {}) {
    currentSite = saved;
    dirty = false;
    publicationRetrySite = null;
    clearDraft();
    unregisterDirtyGuard();
    setSaveState(form, "published");
    setPublicationButtonText(form, "Опубликовано");
    statusRegion.textContent = options.message ?? "Опубликовано";
    onStatus(options.message ?? "Опубликовано");
    if (typeof options.message === "string") {
      renderFormLevelError(form, options.message, null);
    }
    if (options.notify !== false) {
      onSaved(saved);
    }
  }

  function readSiteIdForPublication(site) {
    const id = typeof site?.id === "string" ? site.id : siteId;

    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw invalidSaveResponse();
    }

    return id;
  }


  function clearPublicationObserver() {
    publicationPollController?.abort();
    publicationPollController = null;
  }

  function isHarnessUnexpectedRequest(error) {
    return error?.code === undefined &&
      typeof error?.message === "string" &&
      /Unexpected (request|path|multipart request)/.test(error.message);
  }

  function isTransientPublicationStatusError(error) {
    if (destroyed) {
      return false;
    }
    if (error?.code === "NETWORK_ERROR" || error?.code === "REQUEST_TIMEOUT" || error?.code === "TIMEOUT") {
      return true;
    }
    if (error?.code === undefined && Number(error?.status) === 0) {
      return true;
    }
    if (Number(error?.status) >= 500) {
      return true;
    }

    return false;
  }

  async function loadPublicCatalogDemoSetting() {
    if (!canPublish) {
      return;
    }

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_STATUS_PATH, {
        method: "GET"
      });
      const nextValue = readPublicCatalogStatusShowDemoInModal(response);

      if (typeof nextValue === "boolean") {
        publicCatalogShowDemoInModal = nextValue;
        demoModalStatusAvailable = true;
      }
    } catch (error) {
      if (!isHarnessUnexpectedRequest(error)) {
        publicCatalogShowDemoInModal = null;
        demoModalStatusAvailable = false;
      }
    }
  }

  async function uploadSelectedImages(siteIdForUpload, imageSelection, form) {
    const retryPlan = {
      gallery: [],
      galleryAlt: imageSelection.galleryAlt,
      preview: null,
      siteId: siteIdForUpload
    };
    let failedCount = 0;
    let succeededCount = 0;
    const failedItems = [];
    let requestId = null;
    const succeededItems = [];
    const totalUploads = (imageSelection.previewFile === null ? 0 : 1) + imageSelection.galleryFiles.length;
    let currentUpload = 0;

    if (imageSelection.previewFile !== null) {
      setSaveState(form, "uploadingPreview");
      currentUpload += 1;
      setUploadProgress(form, currentUpload, totalUploads);
      statusRegion.textContent = "Загружаем главное изображение...";
      onStatus("Загружаем главное изображение...");
      const previewClientFileId = createClientFileId(uuidFactory);

      try {
        await apiClient.requestMultipart(buildImagePath(siteIdForUpload, "preview"), {
          body: buildPreviewFormData({
            alt: imageSelection.previewAlt,
            clientFileId: previewClientFileId,
            file: imageSelection.previewFile
          }),
          method: "PUT"
        });
        succeededCount += 1;
        succeededItems.push(imageUploadDetail("Главное изображение", imageSelection.previewFile));
      } catch (error) {
        failedCount += 1;
        const failure = classifyImageUploadFailure(error, previewClientFileId);

        requestId ??= failure.requestId;
        failedItems.push(imageUploadDetail("Главное изображение", imageSelection.previewFile, {
          message: failure.message,
          requestId: failure.requestId,
          retryable: failure.retryable
        }));
        if (failure.retryable) {
          retryPlan.preview = {
            alt: imageSelection.previewAlt,
            clientFileId: previewClientFileId,
            file: imageSelection.previewFile
          };
        }
      }
    }

    if (imageSelection.galleryFiles.length > 0) {
      setSaveState(form, "uploadingGallery");
      statusRegion.textContent = "Загружаем изображения галереи...";
      onStatus("Загружаем изображения галереи...");
      const clientFileIds = imageSelection.galleryFiles.map(() => createClientFileId(uuidFactory));

      for (let index = 0; index < imageSelection.galleryFiles.length; index += 1) {
        const file = imageSelection.galleryFiles[index];
        const clientFileId = clientFileIds[index];

        currentUpload += 1;
        setUploadProgress(form, currentUpload, totalUploads);
        statusRegion.textContent = `Загружаем изображение галереи ${index + 1} из ${imageSelection.galleryFiles.length}...`;
        onStatus(statusRegion.textContent);

        try {
          await uploadSingleGalleryImage(siteIdForUpload, {
            alt: imageSelection.galleryAlt,
            clientFileId,
            file
          });
          imageProcessingTimeoutCounts.delete(clientFileId);
          succeededCount += 1;
          succeededItems.push(imageUploadDetail("Изображение галереи", file));
        } catch (error) {
          const failure = classifyImageUploadFailure(error, clientFileId);

          requestId ??= failure.requestId;
          failedCount += 1;
          failedItems.push(imageUploadDetail("Изображение галереи", file, {
            message: failure.message,
            requestId: failure.requestId,
            retryable: failure.retryable
          }));
          if (failure.retryable) {
            retryPlan.gallery.push({
              clientFileId,
              file,
              index
            });
          }
        }
      }
    }

    let verifiedSite = null;
    if (imageSelection.hasAny && failedCount === 0) {
      setSaveState(form, "verifyingUploads");
      statusRegion.textContent = "Проверяем сохранённые изображения...";
      onStatus("Проверяем сохранённые изображения...");
      await wait(0);
      try {
        verifiedSite = await verifySavedSiteById(siteIdForUpload);
        currentSite = verifiedSite;
      } catch (error) {
        const failureRequestId = readRequestId(error);

        requestId ??= failureRequestId;
        failedCount += 1;
        failedItems.push(imageUploadDetail("Проверка сохранения", { name: "карточка" }, {
          message: safeMessage(error),
          requestId: failureRequestId,
          retryable: false
        }));
      }
    }

    return {
      failedCount,
      failedItems,
      requestId,
      retryPlan,
      site: verifiedSite,
      succeededCount,
      succeededItems
    };
  }

  async function uploadSingleGalleryImage(siteIdForUpload, input) {
    const response = await apiClient.requestMultipart(buildImagePath(siteIdForUpload, "gallery"), {
      body: buildPreviewFormData({
        alt: input.alt,
        clientFileId: input.clientFileId,
        file: input.file
      }),
      method: "POST"
    });

    if (typeof response?.data?.image?.assetId !== "string") {
      throw invalidSaveResponse();
    }

    return response.data.image;
  }

  function classifyImageUploadFailure(error, clientFileId) {
    const requestId = readRequestId(error);
    let message = safeMessage(error);
    let retryable = isRetryableImageUploadError(error);

    if (error?.code === "IMAGE_PROCESSING_TIMEOUT" && typeof clientFileId === "string") {
      const nextCount = (imageProcessingTimeoutCounts.get(clientFileId) ?? 0) + 1;

      imageProcessingTimeoutCounts.set(clientFileId, nextCount);
      if (nextCount >= 2) {
        retryable = false;
        message = "Изображение повторно не обработалось. Сожмите или перекодируйте файл и загрузите заново.";
      }
    }

    return {
      message,
      requestId,
      retryable
    };
  }

  function renderCreateSavedNextStep(saved, options = {}) {
    const message = typeof options.message === "string" ? options.message : "Карточка сохранена.";
    const title = typeof options.title === "string" ? options.title : "Черновик сохранён";
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
          text: title
        }),
        createElement("p", {
          documentRef,
          text: message
        }),
        createElement("div", {
          documentRef,
          className: "admin-save-next-actions",
          children: actions
        })
      ]
    }));
  }

  function renderSavedWithImageErrors(saved, result) {
    const retryable = hasRetryableImageUploads(result.retryPlan);

    replaceContent(formHost, createElement("section", {
      documentRef,
      className: "admin-save-next-step admin-save-partial",
      attributes: {
        "data-save-state": "savedWithImageErrors"
      },
      children: [
        createElement("p", {
          documentRef,
          className: "admin-kicker",
          text: "Черновик"
        }),
        createElement("h3", {
          documentRef,
          text: "Карточка сохранена. Часть изображений не загрузилась."
        }),
        createElement("p", {
          documentRef,
          text: `Изображения: ${result.succeededCount} успешно, ${result.failedCount} ${formatImageErrorCount(result.failedCount)}.`
        }),
        ...(typeof result.requestId === "string"
          ? [createRequestIdControl(result.requestId, { documentRef })]
          : []),
        renderImageUploadDetails(result),
        createElement("div", {
          documentRef,
          className: "admin-save-next-actions",
          children: [
            ...(retryable
              ? [
                  createElement("button", {
                    documentRef,
                    text: "Повторить загрузку изображений",
                    attributes: {
                      "data-action": "retry-image-upload",
                      type: "button"
                    },
                    on: {
                      click: retryFailedImageUploads
                    }
                  })
                ]
              : []),
            createElement("button", {
              documentRef,
              text: "Открыть изображения",
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
          ]
        })
      ]
    }));
    statusRegion.textContent = "Карточка сохранена. Не все изображения загружены.";
    onStatus("Карточка сохранена. Не все изображения загружены.");
  }

  function renderImageUploadDetails(result) {
    const children = [];
    const succeededItems = Array.isArray(result?.succeededItems) ? result.succeededItems : [];
    const failedItems = Array.isArray(result?.failedItems) ? result.failedItems : [];

    if (succeededItems.length > 0) {
      children.push(createImageUploadDetailGroup("Успешно загружено", succeededItems));
    }
    if (failedItems.length > 0) {
      children.push(createImageUploadDetailGroup("Не загрузилось", failedItems));
    }

    return createElement("div", {
      documentRef,
      className: "admin-image-upload-result",
      children
    });
  }

  function createImageUploadDetailGroup(title, items) {
    return createElement("section", {
      documentRef,
      className: "admin-image-upload-result-group",
      children: [
        createElement("strong", {
          documentRef,
          text: title
        }),
        createElement("ul", {
          documentRef,
          children: items.map((item) => createElement("li", {
            documentRef,
            text: imageUploadDetailText(item)
          }))
        })
      ]
    });
  }

  function imageUploadDetailText(item) {
    const base = `${item.slot}: ${item.fileName}`;
    const message = typeof item.message === "string" && item.message.length > 0 ? item.message : "";
    const requestId = typeof item.requestId === "string" && item.requestId.length > 0 ? `requestId: ${item.requestId}` : "";
    const detail = [message, requestId].filter(Boolean).join(" — ");

    return detail.length > 0 ? `${base} — ${detail}` : base;
  }

  async function retryFailedImageUploads() {
    if (busy || imageRetryPlan === null) {
      return;
    }

    busy = true;
    const plan = imageRetryPlan;
    imageRetryPlan = null;
    let failedCount = 0;
    let succeededCount = 0;
    const failedItems = [];
    let requestId = null;
    const succeededItems = [];
    const nextPlan = {
      gallery: [],
      galleryAlt: plan.galleryAlt,
      preview: null,
      siteId: plan.siteId
    };

    try {
      statusRegion.textContent = "Загружаем главное изображение...";
      onStatus("Загружаем главное изображение...");
      if (plan.preview !== null) {
        try {
          await apiClient.requestMultipart(buildImagePath(plan.siteId, "preview"), {
            body: buildPreviewFormData({
              alt: plan.preview.alt,
              clientFileId: plan.preview.clientFileId,
              file: plan.preview.file
            }),
            method: "PUT"
          });
          imageProcessingTimeoutCounts.delete(plan.preview.clientFileId);
          succeededCount += 1;
          succeededItems.push(imageUploadDetail("Главное изображение", plan.preview.file));
        } catch (error) {
          failedCount += 1;
          const failure = classifyImageUploadFailure(error, plan.preview.clientFileId);

          requestId ??= failure.requestId;
          failedItems.push(imageUploadDetail("Главное изображение", plan.preview.file, {
            message: failure.message,
            requestId: failure.requestId,
            retryable: failure.retryable
          }));
          if (failure.retryable) {
            nextPlan.preview = plan.preview;
          }
        }
      }

      if (plan.gallery.length > 0) {
        statusRegion.textContent = "Загружаем изображения галереи...";
        onStatus("Загружаем изображения галереи...");

        for (let retryIndex = 0; retryIndex < plan.gallery.length; retryIndex += 1) {
          const item = plan.gallery[retryIndex];

          statusRegion.textContent = `Повторно загружаем изображение галереи ${retryIndex + 1} из ${plan.gallery.length}...`;
          onStatus(statusRegion.textContent);

          try {
            await uploadSingleGalleryImage(plan.siteId, {
              alt: plan.galleryAlt,
              clientFileId: item.clientFileId,
              file: item.file
            });
            imageProcessingTimeoutCounts.delete(item.clientFileId);
            succeededCount += 1;
            succeededItems.push(imageUploadDetail("Изображение галереи", item.file));
          } catch (error) {
            const failure = classifyImageUploadFailure(error, item.clientFileId);

            requestId ??= failure.requestId;
            failedCount += 1;
            failedItems.push(imageUploadDetail("Изображение галереи", item.file, {
              message: failure.message,
              requestId: failure.requestId,
              retryable: failure.retryable
            }));
            if (failure.retryable) {
              nextPlan.gallery.push(item);
            }
          }
        }
      }

      let verifiedSite = currentSite;
      if (failedCount === 0 && hasAnyImagesInRetryPlan(plan)) {
        statusRegion.textContent = "Проверяем сохранённые изображения...";
        onStatus("Проверяем сохранённые изображения...");
        try {
          verifiedSite = await verifySavedSiteById(plan.siteId);
          currentSite = verifiedSite;
        } catch (error) {
          const failureRequestId = readRequestId(error);

          requestId ??= failureRequestId;
          failedCount += 1;
          failedItems.push(imageUploadDetail("Проверка сохранения", { name: "карточка" }, {
            message: safeMessage(error),
            requestId: failureRequestId,
            retryable: false
          }));
        }
      }

      if (failedCount > 0) {
        imageRetryPlan = nextPlan;
        renderSavedWithImageErrors(verifiedSite, {
          failedCount,
          failedItems,
          requestId,
          retryPlan: nextPlan,
          succeededCount,
          succeededItems
        });
        return;
      }

      renderCreateSavedNextStep(verifiedSite, {
        message: "Карточка и изображения сохранены.",
        title: "Карточка сохранена"
      });
      statusRegion.textContent = "Карточка и изображения сохранены.";
      onStatus("Карточка и изображения сохранены.");
    } finally {
      busy = false;
    }
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
      ...(canPublish ? [createDemoModalSwitch()] : []),
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

  function createImageSection(errors) {
    const previewInput = createElement("input", {
      documentRef,
      attributes: {
        accept: supportedImageTypes.join(","),
        name: "previewImage",
        type: "file"
      }
    });
    const galleryInput = createElement("input", {
      documentRef,
      attributes: {
        accept: supportedImageTypes.join(","),
        multiple: true,
        name: "galleryBatchImages",
        type: "file"
      }
    });
    const previewSelection = createElement("p", {
      documentRef,
      className: "admin-upload-selection"
    });
    const gallerySelection = createElement("p", {
      documentRef,
      className: "admin-upload-selection"
    });

    previewInput.addEventListener("change", () => {
      previewSelection.textContent = selectedNames(previewInput.files);
      scheduleDraftSave(formHost.querySelector("form"));
    });
    galleryInput.addEventListener("change", () => {
      gallerySelection.textContent = selectedNames(galleryInput.files);
      scheduleDraftSave(formHost.querySelector("form"));
    });

    return createSection("Изображения — необязательно", [
      createElement("p", {
        documentRef,
        className: "admin-field-help",
        text: "JPG, PNG, WEBP, AVIF. 5 MB на файл. За раз можно выбрать до 10 файлов, общий размер до 30 MB. В галерее максимум 20 изображений."
      }),
      createElement("label", {
        documentRef,
        className: "admin-field",
        children: [
          createElement("span", { documentRef, text: "Главное изображение" }),
          previewInput,
          previewSelection,
          renderFieldErrors("previewImage", errors)
        ]
      }),
      createField("previewAlt", "Описание главного изображения", "input", errors, readValue("previewAlt"), {
        maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt)
      }),
      createElement("label", {
        documentRef,
        className: "admin-field",
        children: [
          createElement("span", { documentRef, text: "Изображения галереи" }),
          galleryInput,
          gallerySelection,
          renderFieldErrors("galleryBatchImages", errors)
        ]
      }),
      createField("galleryBatchAlt", "Общее описание изображений галереи", "input", errors, readValue("galleryBatchAlt"), {
        maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt)
      })
    ]);
  }

  function createAdvancedSection(errors) {
    const shouldOpen = hasAdvancedErrors(errors);

    return createElement("details", {
      documentRef,
      className: "admin-editor-section admin-editor-advanced",
      attributes: {
        "data-section": "advanced-site-settings",
        open: shouldOpen ? "" : undefined
      },
      children: [
        createElement("summary", {
          documentRef,
          text: "Расширенные настройки"
        }),
        ...(mode === "create" || role === "admin" ? [createSlugField(errors)] : []),
        createField("previewType", "Тип отображения карточки", "input", errors, readValue("previewType"), {
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
    const primaryButton = canPublish
      ? createElement("button", {
          documentRef,
          className: "admin-publication-control",
          text: "Опубликовать",
          attributes: {
            "aria-busy": "false",
            "data-action": "save-site",
            "data-primary-publication-control": "true",
            type: "submit"
          }
        })
      : createElement("button", {
          documentRef,
          text: "Сохранить",
          attributes: {
            "data-action": "save-site",
            type: "submit"
          }
        });

    return createElement("div", {
      documentRef,
      className: "admin-editor-actions",
      children: [
        primaryButton,
        createElement("button", {
          documentRef,
          text: "Отмена",
          attributes: {
            "data-action": "cancel-editor",
            type: "button"
          },
          on: {
            click: () => {
              const form = formHost.querySelector("form");

              if (dirty && form !== null) {
                persistDraft(form);
              }
              onCancel();
            }
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

  function createDemoModalSwitch() {
    if (!demoModalBusy && demoModalQueuedValue === null) {
      demoModalConfirmed = readDemoModalInitialValue();
      demoModalDesired = demoModalConfirmed;
    }

    const status = createElement("span", {
      documentRef,
      className: "admin-demo-switch-status",
      attributes: {
        "aria-live": "polite",
        "data-demo-switch-status": "true"
      },
      text: demoModalBusy ? "Публикуется..." : demoModalStatusAvailable ? "Сохранено" : "Ошибка"
    });
    const switchControl = createElement("button", {
      documentRef,
      className: "admin-demo-switch-control",
      attributes: {
        "aria-checked": String(demoModalDesired),
        "aria-describedby": "admin-demo-switch-status",
        "data-action": "toggle-demo-modal",
        role: "switch",
        type: "button"
      },
      children: [
        createElement("span", {
          documentRef,
          className: "admin-switch-track",
          attributes: { "aria-hidden": "true" },
          children: [
            createElement("span", {
              documentRef,
              className: "admin-switch-thumb"
            })
          ]
        }),
        createElement("span", {
          documentRef,
          className: "admin-demo-switch-label",
          text: "Открывать демо внутри WEB00"
        })
      ],
      on: {
        click: () => {
          toggleDemoModalSetting(switchControl, status);
        }
      }
    });

    status.setAttribute("id", "admin-demo-switch-status");
    switchControl.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }

      event.preventDefault?.();
      toggleDemoModalSetting(switchControl, status);
    });
    updateDemoSwitchControl(switchControl, status);
    demoModalSwitchControl = switchControl;
    demoModalStatusElement = status;

    return createElement("div", {
      documentRef,
      className: "admin-demo-switch",
      children: [
        switchControl,
        status
      ]
    });
  }

  function toggleDemoModalSetting(switchControl, status) {
    if (!canPublish || destroyed || !demoModalStatusAvailable || demoModalBusy || busy) {
      return;
    }

    demoModalDesired = !demoModalDesired;
    updateDemoSwitchControl(switchControl, status);

    void persistDemoModalSetting(demoModalDesired, switchControl, status);
  }

  async function persistDemoModalSetting(value, switchControl, status) {
    if (!canPublish || destroyed) {
      return;
    }

    const controller = new AbortController();

    demoModalController = controller;
    demoModalBusy = true;
    demoModalQueuedValue = null;
    updateDemoSwitchControl(switchControl, status);

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_SETTINGS_PATH, {
        body: {
          showDemoInModal: value
        },
        credentials: "same-origin",
        headers: {
          "X-CSRF-Token": "web00-admin"
        },
        method: "PATCH",
        signal: controller.signal
      });
      if (destroyed || controller.signal.aborted) {
        return;
      }
      const update = readDemoModalSettingsUpdate(response);
      const confirmed = update.confirmed;

      publicCatalogShowDemoInModal = confirmed;
      demoModalConfirmed = confirmed;
      demoModalStatusAvailable = true;
      if (demoModalQueuedValue === confirmed) {
        demoModalQueuedValue = null;
      }

      demoModalDesired = demoModalQueuedValue ?? demoModalConfirmed;
      updateDemoSwitchControl(switchControl, status);
      if (update.syncStatus === "failed") {
        throw demoSyncError();
      }
      if (update.syncStatus !== "ready") {
        await waitForDemoModalSyncReady(switchControl, status, controller.signal);
        if (destroyed || controller.signal.aborted) {
          return;
        }
      }

      setDemoSwitchStatus(status, "Сохранено");
    } catch (error) {
      if (destroyed || controller.signal.aborted) {
        return;
      }
      demoModalDesired = demoModalConfirmed;
      demoModalQueuedValue = null;
      setDemoSwitchStatus(status, demoSwitchErrorText(error));
      renderErrorStatus(error);
    } finally {
      if (demoModalController === controller) {
        demoModalController = null;
      }
      if (!destroyed) {
        demoModalBusy = false;
        updateDemoSwitchControl(switchControl, status);
        flushQueuedDemoModalSetting();
      }
    }
  }

  function updateDemoSwitchControl(switchControl, status) {
    const disabled = !demoModalStatusAvailable || demoModalBusy || busy;

    switchControl.setAttribute("aria-checked", String(demoModalDesired));
    switchControl.setAttribute("aria-busy", String(demoModalBusy || (busy && demoModalQueuedValue !== null)));
    switchControl.setAttribute("aria-disabled", String(disabled));
    switchControl.setAttribute("data-state", demoModalDesired ? "on" : "off");
    if (disabled) {
      switchControl.setAttribute("disabled", "");
    } else {
      switchControl.removeAttribute("disabled");
    }

    if (demoModalBusy || (busy && demoModalQueuedValue !== null)) {
      setDemoSwitchStatus(status, "Публикуется...");
    } else if (!demoModalStatusAvailable) {
      setDemoSwitchStatus(status, "Ошибка");
    } else if (!status.textContent?.startsWith("Ошибка")) {
      setDemoSwitchStatus(status, "Сохранено");
    }
  }

  function flushQueuedDemoModalSetting() {
    if (
      !canPublish ||
      destroyed ||
      busy ||
      demoModalBusy ||
      demoModalQueuedValue === null ||
      demoModalSwitchControl === null ||
      demoModalStatusElement === null
    ) {
      return;
    }

    const nextValue = demoModalQueuedValue;

    demoModalQueuedValue = null;
    void persistDemoModalSetting(nextValue, demoModalSwitchControl, demoModalStatusElement);
  }

  function setDemoSwitchStatus(status, text) {
    status.textContent = text;
  }

  function demoSwitchErrorText(error) {
    const requestId = readRequestId(error);

    return requestId === null ? "Ошибка" : `Ошибка ${requestId}`;
  }

  async function waitForDemoModalSyncReady(switchControl, status, signal) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (destroyed || signal?.aborted) {
        throw publicationAbortedError();
      }
      setDemoSwitchStatus(status, "Публикуется...");
      const delay = publicationPollIntervalMs;

      if (attempt > 0) {
        await wait(delay);
      }
      if (destroyed || signal?.aborted) {
        throw publicationAbortedError();
      }

      const response = await apiClient.requestJson(PUBLIC_CATALOG_STATUS_PATH, {
        method: "GET",
        signal
      });
      if (destroyed || signal?.aborted) {
        throw publicationAbortedError();
      }
      const confirmed = readPublicCatalogStatusShowDemoInModal(response);
      const catalogStatus = readPublicCatalogStatus(response);

      if (typeof confirmed === "boolean") {
        publicCatalogShowDemoInModal = confirmed;
        demoModalConfirmed = confirmed;
        demoModalDesired = confirmed;
        demoModalStatusAvailable = true;
        updateDemoSwitchControl(switchControl, status);
      }
      if (isPublicCatalogReady(catalogStatus)) {
        return;
      }
      if (catalogStatus.syncStatus === "failed") {
        throw demoSyncError();
      }
    }

    throw demoSyncError();
  }

  function readDemoModalSettingsUpdate(response) {
    const confirmed = readConfirmedDemoModalSetting(response);
    const syncStatus = readPublicCatalogSyncResultStatus(response?.data?.sync);

    return { confirmed, syncStatus };
  }

  function readConfirmedDemoModalSetting(response) {
    if (typeof response?.data?.showDemoInModal === "boolean") {
      return response.data.showDemoInModal;
    }
    if (typeof response?.data?.status?.showDemoInModal === "boolean") {
      return response.data.status.showDemoInModal;
    }

    throw invalidResponseError();
  }

  function readPublicCatalogStatusShowDemoInModal(response) {
    if (typeof response?.data?.showDemoInModal === "boolean") {
      return response.data.showDemoInModal;
    }
    if (typeof response?.data?.status?.showDemoInModal === "boolean") {
      return response.data.status.showDemoInModal;
    }

    return null;
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

    throw invalidResponseError();
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

  function readPublicCatalogSyncResultStatus(sync) {
    if (sync?.status === "pending" || sync?.status === "ready" || sync?.status === "failed") {
      return sync.status;
    }

    throw invalidResponseError();
  }

  function readDemoModalInitialValue() {
    if (typeof publicCatalogShowDemoInModal === "boolean") {
      return publicCatalogShowDemoInModal;
    }

    return currentSite?.showDemoInModal === true;
  }

  function demoSyncError() {
    const error = new Error("Ошибка публикации");

    error.code = "PUBLICATION_FAILED";
    error.status = 409;
    return error;
  }

  function abortDemoModalSettingRequest() {
    demoModalController?.abort();
    demoModalController = null;
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

  function renderFormErrors(errors) {
    const messages = Array.isArray(errors?._form) ? errors._form : [];

    return createElement("p", {
      documentRef,
      className: "admin-state admin-state-error",
      attributes: {
        "aria-live": "polite",
        "data-field-error": "_form",
        role: "alert"
      },
      text: messages.join(" ")
    });
  }

  function renderFormLevelError(form, message, requestId = null) {
    const target = form?.querySelector?.('[data-field-error="_form"]');

    if (target !== null && target !== undefined) {
      const children = [];

      if (typeof message === "string" && message.length > 0) {
        children.push(createElement("span", {
          documentRef,
          text: message
        }));
      }
      if (typeof requestId === "string" && requestId.length > 0) {
        children.push(createRequestIdControl(requestId, { documentRef }));
      }

      replaceContent(target, ...children);
    }
  }

  function renderErrorStatus(error) {
    const children = [
      createElement("span", {
        documentRef,
        text: safeMessage(error)
      })
    ];

    const requestId = readRequestId(error);

    if (requestId !== null) {
      children.push(createRequestIdControl(requestId, { documentRef }));
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
              if (mode === "create" && typeof pendingDraft?.clientRequestId === "string") {
                clientRequestId = pendingDraft.clientRequestId;
                clientRequestIdError = null;
              }
              imageRecoveryNotice = pendingDraft?.hadImageSelection === true;
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
              if (mode === "create") {
                resetClientRequestId();
              }
              imageRecoveryNotice = false;
              pendingDraft = null;
              renderForm({});
            }
          }
        })
      ]
    });
  }

  function createDraftStorageWarning() {
    return createElement("p", {
      documentRef,
      className: "admin-state admin-state-warning",
      attributes: {
        "data-draft-storage-warning": "true"
      },
      text: DRAFT_STORAGE_WARNING
    });
  }

  function createImageRecoveryNotice() {
    return createElement("p", {
      documentRef,
      className: "admin-state",
      text: "Текст восстановлен. Изображения выберите повторно."
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
    if (form === null) {
      return;
    }
    dirty = true;
    publicationRetrySite = null;
    registerDirtyGuard();
    clearDraftSaveTimer();
    draftSaveTimer = setTimeout(() => {
      persistDraft(form);
    }, draftAutosaveMs);
  }

  function persistDraft(form) {
    const stored = writeSiteFormDraft(storage, draftKey, {
      clientRequestId,
      fields: readFormState(form),
      hadImageSelection: hasSelectedImageFiles(form),
      mode,
      routeType: mode,
      siteId: mode === "edit" ? siteId : null,
      temporaryClientId: mode === "create" ? "new" : null,
      updatedAt: new Date().toISOString()
    });

    if (storage !== null && stored === false) {
      showDraftStorageWarning();
    }
  }

  function resetClientRequestId() {
    try {
      clientRequestId = createStableClientRequestId();
      clientRequestIdError = null;
    } catch (error) {
      clientRequestId = null;
      clientRequestIdError = error;
    }
  }

  function ensureClientRequestId() {
    if (mode !== "create") {
      return createStableClientRequestId();
    }
    if (typeof clientRequestId === "string" && clientRequestId.length > 0) {
      return clientRequestId;
    }

    clientRequestId = createStableClientRequestId();
    clientRequestIdError = null;
    return clientRequestId;
  }

  function clearDraft() {
    clearDraftSaveTimer();
    const removed = removeSiteFormDraft(storage, draftKey);

    if (storage !== null && removed === false && dirty) {
      showDraftStorageWarning();
    }
  }

  function showDraftStorageWarning() {
    draftStorageWarning = true;
    statusRegion.textContent = DRAFT_STORAGE_WARNING;
    onStatus(DRAFT_STORAGE_WARNING);
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

  function registerLifecycleListeners() {
    documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);
    windowRef?.addEventListener?.("pagehide", handlePageHide);
  }

  function unregisterLifecycleListeners() {
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    windowRef?.removeEventListener?.("pagehide", handlePageHide);
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
    persistCurrentDraftImmediately();
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

  function handleVisibilityChange() {
    if (documentRef?.visibilityState === "hidden") {
      persistCurrentDraftImmediately();
    }
  }

  function handlePageHide() {
    persistCurrentDraftImmediately();
  }

  function persistCurrentDraftImmediately() {
    if (!dirty) {
      return;
    }

    const form = formHost.querySelector("form");

    if (form !== null) {
      clearDraftSaveTimer();
      persistDraft(form);
    }
  }

  async function ensureBackendReady() {
    await apiClient.requestJson(READY_PATH, {
      auth: false,
      method: "GET",
      timeoutMs: ADMIN_REQUEST_TIMEOUTS.readinessAttempt
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
      const saved = await verifyCreatedSiteBySlug(formState.slug);

      if (saved !== null) {
        finishSuccessfulSave(saved, form, "Сохранено. Запись найдена после проверки.");
        return true;
      }
    } catch {
      // Verification is best-effort; the local form draft is preserved either way.
    }

    setSaveState(form, "failedNetwork");
    renderCurrentFormErrors(form, {
      _form: ["Сервер не ответил. Запись не найдена. Можно повторить."]
    }, error);
    statusRegion.textContent = "Сервер не ответил. Запись не найдена. Можно повторить.";
    onStatus("Сервер не ответил. Запись не найдена. Можно повторить.");
    return true;
  }

  async function verifyCreatedSiteBySlug(slugValue) {
    const slug = String(slugValue ?? "").trim();

    if (slug.length === 0) {
      return null;
    }

    const response = await apiClient.requestJson(
      `/api/admin/sites?search=${encodeURIComponent(slug)}&deleted=without`,
      { method: "GET" }
    );

    return (Array.isArray(response?.data) ? response.data : [])
      .find((site) => site?.slug === slug) ?? null;
  }

  async function verifySavedSiteById(savedSiteId) {
    const response = await apiClient.requestJson(sitePath(savedSiteId), {
      method: "GET"
    });

    return readSiteResponseEntity(response);
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

function hasAdvancedErrors(errors) {
  return [
    "demoLocalUrl",
    "demoUrl",
    "externalDemoUrl",
    "legacyTitle",
    "originalDemoUrl",
    "previewType",
    "siteUrl",
    "slug",
    "sortOrder"
  ].some((field) => Array.isArray(errors?.[field]) && errors[field].length > 0);
}

function readFormState(form) {
  const state = {};

  for (const field of form.querySelectorAll("[name]")) {
    if (field.type === "file") {
      continue;
    }
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

function readImageSelection(form) {
  const previewInput = form.querySelector('[name="previewImage"]');
  const galleryInput = form.querySelector('[name="galleryBatchImages"]');
  const previewFile = previewInput?.files?.[0] ?? null;
  const galleryFiles = Array.from(galleryInput?.files ?? []);

  return {
    galleryAlt: form.querySelector('[name="galleryBatchAlt"]')?.value ?? "",
    galleryFiles,
    hasAny: previewFile !== null || galleryFiles.length > 0,
    previewAlt: form.querySelector('[name="previewAlt"]')?.value ?? "",
    previewFile
  };
}

function emptyImageSelection() {
  return {
    galleryAlt: "",
    galleryFiles: [],
    hasAny: false,
    previewAlt: "",
    previewFile: null
  };
}

function validateImageSelection(selection) {
  try {
    selection.previewAlt = normalizeAlt(selection.previewAlt);
  } catch (error) {
    throw new FormValidationError([{
      message: safeMessage(error),
      path: "previewAlt"
    }]);
  }
  try {
    selection.galleryAlt = normalizeAlt(selection.galleryAlt);
  } catch (error) {
    throw new FormValidationError([{
      message: safeMessage(error),
      path: "galleryBatchAlt"
    }]);
  }
  if (selection.previewFile !== null) {
    try {
      validateImageFile(selection.previewFile);
    } catch (error) {
      throw new FormValidationError([{
        message: safeMessage(error),
        path: "previewImage"
      }]);
    }
  }

  if (selection.galleryFiles.length > 0) {
    try {
      validateBatch(selection.galleryFiles);
    } catch (error) {
      throw new FormValidationError([{
        message: safeMessage(error),
        path: "galleryBatchImages"
      }]);
    }
  }
}

function hasSelectedImageFiles(form) {
  return form.querySelector('[name="previewImage"]')?.files?.length > 0 ||
    form.querySelector('[name="galleryBatchImages"]')?.files?.length > 0;
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
  const publicationControl = form?.querySelector?.('[data-primary-publication-control="true"]');
  const hasPublicationControl = publicationControl !== undefined && publicationControl !== null;

  setPublicationButtonText(form, hasPublicationControl ? saveButtonText(state) : saveOnlyButtonText(state));
}

function saveButtonText(state) {
  switch (state) {
    case "warmingBackend":
      return "Проверяем...";
    case "creatingSite":
    case "saving":
      return "Сохраняем...";
    case "verifyingCreate":
    case "verifyingAfterNetworkFailure":
    case "verifyingUploads":
      return "Проверяем...";
    case "uploadingPreview":
    case "uploadingGallery":
      return "Загружаем изображения...";
    case "publicationFailed":
      return "Повторить публикацию";
    case "published":
      return "Опубликовано";
    default:
      return "Опубликовать";
  }
}

function saveOnlyButtonText(state) {
  switch (state) {
    case "warmingBackend":
    case "verifyingCreate":
    case "verifyingAfterNetworkFailure":
    case "verifyingUploads":
      return "Проверяем...";
    case "creatingSite":
    case "saving":
      return "Сохраняем...";
    case "uploadingPreview":
    case "uploadingGallery":
      return "Загружаем изображения...";
    case "saved":
      return "Сохранено";
    default:
      return "Сохранить";
  }
}

function setUploadProgress(form, current, total) {
  const safeCurrent = Number.isFinite(current) ? Math.max(1, current) : 1;
  const safeTotal = Number.isFinite(total) ? Math.max(safeCurrent, total) : safeCurrent;

  setPublicationButtonText(form, `Загружаем изображения ${safeCurrent} из ${safeTotal}...`);
}

function setPublicationButtonText(form, text) {
  const button = form?.querySelector?.('[data-primary-publication-control="true"]') ??
    form?.querySelector?.('[data-action="save-site"]');

  if (button !== null && button !== undefined) {
    button.textContent = text;
  }
}

function sitePath(siteId) {
  if (typeof siteId !== "string" || !UUID_PATTERN.test(siteId)) {
    throw new Error("Invalid site id.");
  }

  return `/api/admin/sites/${siteId}`;
}

function hasPublishedLifecycleState(site) {
  return site?.status === "published" &&
    typeof site?.publishedAt === "string" &&
    site.publishedAt.length > 0 &&
    site?.deletedAt === null;
}

function safeMessage(error) {
  if (error?.code === "BROWSER_CRYPTO_UNAVAILABLE") {
    return "Браузер не может создать безопасный идентификатор операции.";
  }
  if (error?.code === "REQUEST_TIMEOUT") {
    return "Сервер не ответил вовремя. Данные формы сохранены.";
  }
  if (error?.code === "NETWORK_ERROR") {
    return "Связь с сервером прервана. Данные формы сохранены.";
  }
  if (error?.code === "REQUEST_ABORTED") {
    return "Запрос отменён.";
  }
  if (error?.code === "IDEMPOTENCY_KEY_REUSED") {
    return "Эта операция уже использована с другими данными. Начните новую карточку или обновите форму.";
  }
  if (error?.code === "IDEMPOTENCY_REPLAY_UNAVAILABLE") {
    return "Не удалось восстановить результат предыдущего сохранения.";
  }
  if (error?.code === "PUBLIC_CATALOG_SYNC_CONFLICT") {
    return "Публикация уже выполняется. Можно повторить позже.";
  }
  if (error?.code === "PUBLIC_CATALOG_V2_DISABLED") {
    return "Публикация временно недоступна.";
  }
  if (error?.code === "INTERNAL_ERROR" || /prisma|sql|database|stack/i.test(String(error?.message ?? ""))) {
    return "Не удалось сохранить карточку.";
  }
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Не удалось сохранить.";
}

function imageUploadDetail(slot, file, options = {}) {
  return {
    fileName: typeof file?.name === "string" && file.name.trim().length > 0 ? file.name : "файл без имени",
    message: typeof options.message === "string" ? options.message : "",
    requestId: readSafeRequestId(options.requestId),
    retryable: options.retryable === true,
    slot
  };
}

function hasRetryableImageUploads(plan) {
  return plan?.preview !== null ||
    (Array.isArray(plan?.gallery) && plan.gallery.length > 0);
}

function hasAnyImagesInRetryPlan(plan) {
  return plan?.preview !== null ||
    (Array.isArray(plan?.gallery) && plan.gallery.length > 0);
}

const RETRYABLE_IMAGE_UPLOAD_ERROR_CODES = new Set([
  "CONCURRENT_MODIFICATION",
  "DATABASE_TEMPORARY",
  "IMAGE_PROCESSING_TIMEOUT",
  "IMAGE_PROCESSOR_BUSY",
  "IMAGE_STORAGE_TIMEOUT",
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "STORAGE_UNAVAILABLE",
  "STORAGE_WRITE_FAILED"
]);

function isRetryableImageUploadError(error) {
  return RETRYABLE_IMAGE_UPLOAD_ERROR_CODES.has(String(error?.code ?? ""));
}

function formatImageErrorCount(count) {
  const value = Math.abs(Number(count) || 0);
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "ошибок";
  }
  if (lastDigit === 1) {
    return "ошибка";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "ошибки";
  }

  return "ошибок";
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
  return error?.code === "NETWORK_ERROR" ||
    error?.code === "REQUEST_TIMEOUT" ||
    (error?.status === 0 && error?.code !== "INVALID_RESPONSE");
}

function isRetryableCreateFailure(error) {
  return error?.code === "NETWORK_ERROR" || error?.code === "REQUEST_TIMEOUT";
}

function isSlugConflict(error) {
  return error?.code === "SLUG_CONFLICT";
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

function readRequestId(error) {
  return readSafeRequestId(error?.requestId);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
