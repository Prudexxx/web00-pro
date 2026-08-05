import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";
import { formatCentsToRubles } from "../forms.js";

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
const PUBLICATION_POLL_INTERVAL_MS = 1500;
const PUBLICATION_RECONNECT_STORAGE_KEY = "web00_admin_publication_reconnect_v1";
const PUBLICATION_BUSY_STATUSES = new Set([
  "deploying",
  "merge_queued",
  "merged",
  "preparing",
  "pull_request_open",
  "validating"
]);
const PUBLICATION_TERMINAL_STATUSES = new Set([
  "failed",
  "published",
  "setup_required",
  "version_conflict"
]);
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
  const publicationPollIntervalMs = Number.isFinite(options?.pollIntervalMs)
    ? Math.max(0, options.pollIntervalMs)
    : PUBLICATION_POLL_INTERVAL_MS;
  const storage = options?.storage ?? globalThis.localStorage ?? null;
  let activeController = null;
  let categories = [];
  let currentDialog = null;
  let filters = {};
  let destroyed = false;
  let activePublicationOperationId = null;
  let publicationPollController = null;
  let publicationPollTimer = null;

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
      const reconnected = await reconnectRememberedPublication();
      if (!reconnected) {
        statusRegion.textContent = "Список сайтов обновлён.";
        onStatus("Список сайтов обновлён.");
      }
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
    clearPublicationObserver();
    currentDialog?.destroy();
    currentDialog = null;
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
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
      if (actionId === "publish" || actionId === "unpublish" || actionId === "soft-delete") {
        const operation = await startDirectPagesLifecyclePublication(site, actionId);
        if (destroyed) {
          return;
        }
        const terminal = await observeDirectPagesPublication(operation, { waitForTerminal: true });
        if (!destroyed && terminal.status === "published") {
          await load();
          if (!destroyed) {
            statusRegion.textContent = terminal.stableStatus;
            onStatus(terminal.stableStatus);
          }
        }
        return;
      }

      await apiClient.requestJson(action.path(validateUuid(site.id, "site")), {
        allowNoContent: actionId === "permanent-delete",
        method: action.method
      });
      if (destroyed) {
        return;
      }

      statusRegion.textContent = action.success;
      onStatus(action.success);
      await load();
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

  async function startDirectPagesLifecyclePublication(site, actionId) {
    const fullSite = actionId === "soft-delete"
      ? site
      : await readLifecycleSite(site);
    const cardId = readCatalogCardId(fullSite);
    if (cardId === null) {
      throw new Error("Invalid catalog card id.");
    }
    const current = await readCurrentPagesCatalogCard(cardId);
    const pagesAction = actionId === "soft-delete"
      ? "delete"
      : current.blobSha === null
        ? "create"
        : "update";
    const requestId = createPublicationRequestId();
    const response = await apiClient.requestJson("/api/admin/publication/pages", {
      body: {
        action: pagesAction,
        card: pagesAction === "delete"
          ? null
          : buildDirectPagesCatalogCard(fullSite, {
              active: actionId !== "unpublish"
            }),
        cardId,
        expectedBlobSha: pagesAction === "create" ? null : current.blobSha,
        requestId
      },
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": "web00-admin"
      },
      method: "POST"
    });
    const operation = readDirectPagesPublicationDto(response);

    persistPublicationReconnect({
      operationId: operation.operationId,
      prNumber: operation.prNumber,
      requestId: operation.requestId,
      siteId: validateUuid(fullSite.id, "site")
    });

    return operation;
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

  async function readCurrentPagesCatalogCard(cardId) {
    const current = await apiClient.requestJson(`/api/admin/publication/pages/card/${cardId}`, {
      method: "GET"
    });
    const data = current?.data ?? current;

    if (
      typeof data !== "object" ||
      data === null ||
      data.cardId !== cardId ||
      !(typeof data.blobSha === "string" || data.blobSha === null)
    ) {
      throw new Error("Invalid publication card response.");
    }

    return data;
  }

  function buildDirectPagesCatalogCard(site, options = {}) {
    const cardId = readCatalogCardId(site);
    if (cardId === null) {
      throw new Error("Invalid catalog card id.");
    }
    const category = site?.category && typeof site.category === "object"
      ? site.category
      : categories.find((item) => item.id === site?.categoryId) ?? {};
    const categoryTitle = typeof category.title === "string" && category.title.trim()
      ? category.title.trim()
      : "Каталог";
    const categorySlug = typeof category.slug === "string" && category.slug.trim()
      ? category.slug.trim()
      : "";
    const previewImage = readRequiredPublicationUrl(site?.previewImageUrl);
    const galleryImages = readPublicationGalleryUrls(site?.galleryImages);

    return {
      id: cardId,
      slug: cardId,
      sortOrder: Number.isFinite(Number(site?.sortOrder)) ? Number(site.sortOrder) : Number.MAX_SAFE_INTEGER,
      legacyTitle: optionalPublicationText(site?.legacyTitle) ?? optionalPublicationText(site?.title),
      title: requiredPublicationText(site?.title),
      editableTitle: true,
      category: categoryTitle,
      description: requiredPublicationText(site?.shortDescription),
      priceFrom: optionalPublicationText(site?.priceLabel) ?? formatPublicationPrice(site?.priceAmountCents),
      deliveryTime: optionalPublicationText(site?.deliveryLabel),
      features: readPublicationTextArray(site?.features),
      tags: readPublicationTextArray(site?.tags),
      previewImage,
      previewType: optionalPublicationText(site?.previewType),
      filter: categorySlug || undefined,
      demoMode: optionalPublicationText(site?.demoMode),
      demoLocalUrl: site?.demoLocalUrl ?? null,
      externalDemoUrl: optionalPublicationText(site?.externalDemoUrl),
      originalDemoUrl: optionalPublicationText(site?.originalDemoUrl),
      demoUrl: optionalPublicationText(site?.demoUrl),
      siteUrl: optionalPublicationText(site?.siteUrl),
      galleryImages: galleryImages.length > 0 ? galleryImages : [previewImage],
      aliases: [cardId],
      active: options.active === false ? false : site?.active !== false
    };
  }

  function readRequiredPublicationUrl(value) {
    const url = optionalPublicationText(value);
    if (!url) {
      throw new Error("Publication media URL is required.");
    }

    return url;
  }

  function readPublicationGalleryUrls(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => typeof item === "string" ? item : item?.url)
      .map(optionalPublicationText)
      .filter(Boolean);
  }

  function readPublicationTextArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return [...new Set(value.map(optionalPublicationText).filter(Boolean))];
  }

  function requiredPublicationText(value) {
    const text = optionalPublicationText(value);
    if (!text) {
      throw new Error("Publication card text is required.");
    }

    return text;
  }

  function optionalPublicationText(value) {
    const text = String(value ?? "").trim();

    return text || undefined;
  }

  function formatPublicationPrice(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0
      ? formatCentsToRubles(Number(value))
      : undefined;
  }

  async function observeDirectPagesPublication(operation, options = {}) {
    const normalized = readDirectPagesPublicationDto(operation);
    activePublicationOperationId = normalized.operationId;
    applyDirectPagesPublicationDto(normalized);

    if (PUBLICATION_TERMINAL_STATUSES.has(normalized.status)) {
      clearPublicationObserver();
      clearPublicationReconnect();
      return normalized;
    }

    if (options.waitForTerminal === true) {
      await wait(publicationPollIntervalMs > 0 ? publicationPollIntervalMs : 50);
      if (destroyed || activePublicationOperationId !== normalized.operationId) {
        return normalized;
      }
      const next = await fetchDirectPagesPublicationStatus(normalized);

      return observeDirectPagesPublication(next, { waitForTerminal: true });
    }

    if (publicationPollIntervalMs > 0) {
      scheduleDirectPagesPublicationPoll(normalized);
    }

    return normalized;
  }

  async function fetchDirectPagesPublicationStatus(operation) {
    publicationPollController?.abort();
    publicationPollController = new AbortController();

    const response = await apiClient.requestJson(operation.statusUrl, {
      method: "GET",
      signal: publicationPollController.signal
    });

    return readDirectPagesPublicationDto(response, operation.operationId);
  }

  function scheduleDirectPagesPublicationPoll(operation) {
    clearPublicationPollTimer();
    publicationPollTimer = setTimeout(() => {
      void fetchDirectPagesPublicationStatus(operation)
        .then((next) => {
          if (!destroyed && activePublicationOperationId === operation.operationId) {
            void observeDirectPagesPublication(next);
          }
        })
        .catch(() => {
          if (!destroyed && activePublicationOperationId === operation.operationId) {
            scheduleDirectPagesPublicationPoll(operation);
          }
        });
    }, publicationPollIntervalMs);
  }

  function applyDirectPagesPublicationDto(operation) {
    statusRegion.textContent = operation.stableStatus;
    onStatus(operation.stableStatus);
  }

  function readDirectPagesPublicationDto(response, expectedOperationId = null) {
    const data = response?.data ?? response;
    const status = typeof data?.status === "string" ? data.status : "";
    const stableStatus = typeof data?.stableStatus === "string" ? data.stableStatus : "";
    const statusUrl = typeof data?.statusUrl === "string" ? data.statusUrl : "";

    if (
      typeof data !== "object" ||
      data === null ||
      typeof data.operationId !== "string" ||
      !UUID_PATTERN.test(data.operationId) ||
      (expectedOperationId !== null && data.operationId !== expectedOperationId) ||
      (!PUBLICATION_BUSY_STATUSES.has(status) && !PUBLICATION_TERMINAL_STATUSES.has(status)) ||
      typeof data.retryable !== "boolean" ||
      stableStatus.length === 0 ||
      statusUrl !== `/api/admin/publication/pages/${data.operationId}`
    ) {
      throw new Error("Invalid publication status response.");
    }

    return {
      operationId: data.operationId,
      prNumber: Number.isInteger(data.prNumber) ? data.prNumber : null,
      requestId: typeof data.requestId === "string" && UUID_PATTERN.test(data.requestId)
        ? data.requestId
        : data.operationId,
      retryable: data.retryable,
      stableStatus,
      status,
      statusUrl
    };
  }

  function persistPublicationReconnect(metadata) {
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(PUBLICATION_RECONNECT_STORAGE_KEY, JSON.stringify({
        operationId: metadata.operationId,
        prNumber: Number.isInteger(metadata.prNumber) ? metadata.prNumber : null,
        requestId: metadata.requestId,
        siteId: metadata.siteId,
        updatedAt: new Date().toISOString(),
        version: 2
      }));
    } catch {
      // Reconnect metadata is best-effort and contains no secrets.
    }
  }

  function clearPublicationReconnect() {
    try {
      storage?.removeItem?.(PUBLICATION_RECONNECT_STORAGE_KEY);
    } catch {
      // Ignore local storage cleanup failure.
    }
  }

  async function reconnectRememberedPublication() {
    if (role !== "admin") {
      return false;
    }
    const metadata = readPublicationReconnect();
    if (metadata === null) {
      return false;
    }

    try {
      const response = await apiClient.requestJson(`/api/admin/publication/pages/${metadata.requestId}`, {
        method: "GET"
      });
      await observeDirectPagesPublication(readDirectPagesPublicationDto(response, metadata.operationId));
      return true;
    } catch {
      clearPublicationReconnect();
      return false;
    }
  }

  function readPublicationReconnect() {
    if (storage === null) {
      return null;
    }

    try {
      const raw = storage.getItem(PUBLICATION_RECONNECT_STORAGE_KEY);
      if (typeof raw !== "string" || raw.length === 0) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        parsed.version !== 2 ||
        typeof parsed.siteId !== "string" ||
        !UUID_PATTERN.test(parsed.siteId) ||
        typeof parsed.operationId !== "string" ||
        !UUID_PATTERN.test(parsed.operationId) ||
        typeof parsed.requestId !== "string" ||
        !UUID_PATTERN.test(parsed.requestId)
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  function clearPublicationObserver() {
    clearPublicationPollTimer();
    publicationPollController?.abort();
    publicationPollController = null;
    activePublicationOperationId = null;
  }

  function clearPublicationPollTimer() {
    if (publicationPollTimer !== null) {
      clearTimeout(publicationPollTimer);
      publicationPollTimer = null;
    }
  }

  function readCatalogCardId(site) {
    const slug = typeof site?.slug === "string" ? site.slug.trim() : "";

    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
  }

  function createPublicationRequestId() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (value) => (
      (Number(value) ^ Math.trunc(Math.random() * 16) >> Number(value) / 4).toString(16)
    ));
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

  const lifecycleOverflow = createSiteLifecycleOverflow({
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
          }),
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
        ]
      }),
      ...(lifecycleOverflow === null ? [] : [lifecycleOverflow])
    ]
  }));

  return createElement("tr", {
    documentRef,
    children: cells
  });
}

function createSiteLifecycleOverflow({ documentRef, onLifecycleAction, role, site }) {
  const actions = getAvailableLifecycleActions(site, role);

  if (actions.length === 0) {
    return null;
  }

  const menuId = `admin-site-overflow-${site.id}`;
  const menu = createElement("div", {
    documentRef,
    className: "admin-site-overflow-menu",
    attributes: {
      "data-overflow-menu": "true",
      hidden: "",
      id: menuId,
      role: "menu"
    },
    children: actions.map((action) => createElement("button", {
      documentRef,
      text: action.label,
      attributes: {
        "data-lifecycle-action": action.id,
        "data-site-id": site.id,
        role: "menuitem",
        type: "button"
      },
      on: {
        click: (event) => {
          closeSiteOverflowMenu(toggle, menu);
          onLifecycleAction(site, action.id, event.currentTarget ?? event.target);
        }
      }
    }))
  });
  const toggle = createElement("button", {
    documentRef,
    className: "admin-site-overflow-toggle",
    text: "⋯",
    attributes: {
      "aria-controls": menuId,
      "aria-expanded": "false",
      "aria-haspopup": "menu",
      "aria-label": `Действия сайта: ${site.title}`,
      "data-action": "site-row-overflow",
      type: "button"
    },
    on: {
      click: () => {
        setSiteOverflowMenuOpen(toggle, menu, menu.hasAttribute("hidden"));
      }
    }
  });

  toggle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault?.();
    setSiteOverflowMenuOpen(toggle, menu, true);
    menu.querySelector("button")?.focus?.();
  });
  menu.addEventListener("keydown", (event) => {
    const items = Array.from(menu.querySelectorAll("button"));
    const currentIndex = items.indexOf(event.target);

    if (event.key === "Escape") {
      event.preventDefault?.();
      closeSiteOverflowMenu(toggle, menu);
      toggle.focus?.();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault?.();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + items.length) % items.length;

      items[nextIndex]?.focus?.();
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault?.();
      const nextIndex = event.key === "Home" ? 0 : items.length - 1;

      items[nextIndex]?.focus?.();
    }
  });

  return createElement("div", {
    documentRef,
    className: "admin-site-overflow",
    children: [
      toggle,
      menu
    ]
  });
}

function setSiteOverflowMenuOpen(toggle, menu, open) {
  if (open) {
    menu.removeAttribute("hidden");
  } else {
    menu.setAttribute("hidden", "");
  }
  toggle.setAttribute("aria-expanded", String(open));
}

function closeSiteOverflowMenu(toggle, menu) {
  setSiteOverflowMenuOpen(toggle, menu, false);
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
  if ("deletedAt" in site && site.deletedAt !== null && site.deletedAt !== undefined) {
    return role === "admin";
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
