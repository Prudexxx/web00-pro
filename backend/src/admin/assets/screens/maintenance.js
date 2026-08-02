import { ADMIN_REQUEST_TIMEOUTS } from "../api-client.js";
import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";

const CANONICAL_ASSETS_DRY_RUN_PATH = "/api/admin/maintenance/canonical-assets";
const CANONICAL_ASSETS_APPLY_PATH =
  "/api/admin/maintenance/canonical-assets/reconcile";
const PUBLIC_CATALOG_STATUS_PATH = "/api/admin/public-catalog/status";
const PUBLIC_CATALOG_SETTINGS_PATH = "/api/admin/public-catalog/settings";
const PUBLIC_CATALOG_SYNC_PATH = "/api/admin/public-catalog/sync";
const PUBLIC_CATALOG_DRY_RUN_PATH = "/api/admin/public-catalog/dry-run";
const CANONICAL_ASSETS_CONFIRMATION = "WEB00-CANONICAL-ASSETS-15-7";
const PUBLIC_CATALOG_SYNC_CONFIRMATION = "WEB00-PUBLIC-CATALOG-SYNC-V1";
const PUBLIC_CATALOG_DRY_RUN_CONFIRMATION = "WEB00-PUBLIC-CATALOG-DRY-RUN-V1";
const EXPECTED_TARGET_SLUGS = Object.freeze(["mebel", "massage", "drova"]);
const EXPECTED_PREVIEW_STATES = Object.freeze([
  "already-canonical",
  "blocked",
  "legacy-canonical",
  "missing",
  "unknown"
]);
const INVALID_RESPONSE_MESSAGE = "Сервер вернул некорректный ответ.";
const APPLY_BLOCKED_MESSAGE = "Восстановление не выполнено. Повторите проверку состояния.";
const UNEXPECTED_APPLY_FAILURE_MESSAGE = "Не удалось восстановить изображения.";
const SAFE_TECHNICAL_ERROR_PATTERN =
  /DATABASE_URL|Prisma|postgres:\/\/|postgresql:\/\/|token|cookie|password|secret/i;

export function createMaintenanceScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  let activeController = null;
  let currentDialog = null;
  let destroyed = false;
  let latestReport = null;
  let applyReady = false;
  let mutationBusy = false;
  let checking = false;
  let publicCatalogBusy = false;

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const results = createElement("section", {
    documentRef,
    className: "admin-maintenance-results",
    attributes: {
      "aria-live": "polite"
    }
  });
  const dialogHost = createElement("section", {
    documentRef,
    className: "admin-dialog-host"
  });
  const checkButton = createElement("button", {
    documentRef,
    text: "Проверить состояние",
    attributes: {
      "data-action": "check-canonical-assets",
      type: "button"
    },
    on: {
      click: () => {
        void runDryRun();
      }
    }
  });
  const applyButton = createElement("button", {
    documentRef,
    text: "Восстановить изображения",
    attributes: {
      "data-action": "apply-canonical-assets",
      disabled: true,
      type: "button"
    },
    on: {
      click: (event) => {
        openApplyDialog(event.target);
      }
    }
  });
  const publicCatalogStatus = createElement("section", {
    documentRef,
    className: "admin-maintenance-results",
    attributes: {
      "aria-live": "polite",
      "data-region": "public-catalog-status"
    }
  });
  const publicCatalogToggle = createElement("input", {
    documentRef,
    attributes: {
      "data-field": "show-demo-in-modal",
      type: "checkbox"
    }
  });
  const publicCatalogCheckButton = createElement("button", {
    documentRef,
    text: "Обновить статус каталога",
    attributes: {
      "data-action": "check-public-catalog",
      type: "button"
    },
    on: {
      click: () => {
        void loadPublicCatalogStatus();
      }
    }
  });
  const publicCatalogSaveButton = createElement("button", {
    documentRef,
    text: "Сохранить настройку демо",
    attributes: {
      "data-action": "save-public-catalog-settings",
      type: "button"
    },
    on: {
      click: () => {
        void submitPublicCatalogSettings();
      }
    }
  });
  const publicCatalogSyncButton = createElement("button", {
    documentRef,
    text: "Синхронизировать snapshot",
    attributes: {
      "data-action": "sync-public-catalog",
      type: "button"
    },
    on: {
      click: () => {
        openPublicCatalogSyncDialog(publicCatalogSyncButton);
      }
    }
  });
  const publicCatalogDryRunButton = createElement("button", {
    documentRef,
    text: "Проверить каталог без публикации",
    attributes: {
      "data-action": "public-catalog-dry-run",
      type: "button"
    },
    on: {
      click: () => {
        openPublicCatalogDryRunDialog(publicCatalogDryRunButton);
      }
    }
  });
  const publicCatalogPanel = createElement("section", {
    documentRef,
    className: "admin-maintenance-card",
    children: [
      createElement("h3", {
        documentRef,
        text: "Публичный каталог"
      }),
      createElement("p", {
        documentRef,
        text:
          "DB-публикация карточек и публичный snapshot показываются отдельно. Pending/failed не отменяет уже опубликованную карточку."
      }),
      createElement("p", {
        documentRef,
        text: "Проверяет будущий snapshot. Ничего не публикует и не изменяет."
      }),
      createElement("label", {
        documentRef,
        children: [
          publicCatalogToggle,
          createElement("span", {
            documentRef,
            text: "Показать демо в модальном окне"
          })
        ]
      }),
      createElement("div", {
        documentRef,
        className: "admin-form-actions",
        children: [
          publicCatalogCheckButton,
          publicCatalogSaveButton,
          publicCatalogDryRunButton,
          publicCatalogSyncButton
        ]
      }),
      publicCatalogStatus
    ]
  });
  const actionPanel = createElement("div", {
    documentRef,
    className: "admin-form-actions",
    children: [checkButton, applyButton]
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-maintenance-screen",
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
                text: "Обслуживание"
              }),
              createElement("h2", {
                documentRef,
                text: "Восстановление канонических изображений"
              })
            ]
          })
        ]
      }),
      createElement("p", {
        documentRef,
        text: "Действие доступно только администратору и не публикует карточки."
      }),
      ...(role === "admin" ? [actionPanel] : []),
      ...(role === "admin" ? [publicCatalogPanel] : []),
      statusRegion,
      results,
      dialogHost
    ]
  });

  async function load() {
    if (role !== "admin") {
      renderForbidden();
      return;
    }

    statusRegion.textContent = "Запустите проверку перед восстановлением.";
    replaceContent(results, createElement("p", {
      documentRef,
      text: "Сначала выполните dry-run. Apply станет доступен только для ready-отчёта без blockers."
    }));
    replaceContent(publicCatalogStatus, createElement("p", {
      documentRef,
      text: "Статус публичного каталога ещё не загружен."
    }));
    updateApplyState();
  }

  function destroy() {
    destroyed = true;
    abortActiveRequest();
    currentDialog?.destroy();
    currentDialog = null;
  }

  function isMutationBusy() {
    return mutationBusy || publicCatalogBusy;
  }

  async function loadPublicCatalogStatus() {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    publicCatalogBusy = true;
    setPublicCatalogButtonsBusy(true);
    replaceContent(publicCatalogStatus, createElement("p", {
      documentRef,
      text: "Загрузка статуса публичного каталога..."
    }));

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_STATUS_PATH, {
        method: "GET",
        timeoutMs: ADMIN_REQUEST_TIMEOUTS.jsonGet
      });
      const status = parsePublicCatalogStatus(response?.data);

      renderPublicCatalogStatus(status);
      statusRegion.textContent = "Статус публичного каталога обновлён.";
    } catch (error) {
      renderError(publicCatalogStatus, documentRef, error);
      statusRegion.textContent = "Не удалось загрузить публичный каталог.";
    } finally {
      publicCatalogBusy = false;
      setPublicCatalogButtonsBusy(false);
    }
  }

  async function submitPublicCatalogSettings() {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    publicCatalogBusy = true;
    setPublicCatalogButtonsBusy(true);

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_SETTINGS_PATH, {
        body: {
          showDemoInModal: publicCatalogToggle.checked === true
        },
        method: "PATCH",
        timeoutMs: ADMIN_REQUEST_TIMEOUTS.jsonMutation
      });
      const payload = parsePublicCatalogSettingsResult(response?.data);

      renderPublicCatalogStatus(payload.status, payload.sync);
      statusRegion.textContent = publicCatalogSyncMessage(payload.sync);
    } catch (error) {
      renderError(publicCatalogStatus, documentRef, error);
      statusRegion.textContent = "Не удалось сохранить настройку публичного каталога.";
    } finally {
      publicCatalogBusy = false;
      setPublicCatalogButtonsBusy(false);
    }
  }

  async function runPublicCatalogSync() {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    publicCatalogBusy = true;
    setPublicCatalogButtonsBusy(true);

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_SYNC_PATH, {
        body: {
          confirmation: PUBLIC_CATALOG_SYNC_CONFIRMATION
        },
        method: "POST",
        timeoutMs: ADMIN_REQUEST_TIMEOUTS.jsonMutation
      });
      const sync = parsePublicCatalogSyncResult(response?.data);

      renderPublicCatalogSync(sync);
      statusRegion.textContent = publicCatalogSyncMessage(sync);
    } catch (error) {
      renderError(publicCatalogStatus, documentRef, error);
      statusRegion.textContent = "Не удалось синхронизировать публичный каталог.";
    } finally {
      publicCatalogBusy = false;
      setPublicCatalogButtonsBusy(false);
    }
  }

  async function runPublicCatalogDryRun() {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    publicCatalogBusy = true;
    setPublicCatalogButtonsBusy(true);
    replaceContent(publicCatalogStatus, createElement("p", {
      documentRef,
      text: "Проверяем публичный каталог без публикации..."
    }));

    try {
      const response = await apiClient.requestJson(PUBLIC_CATALOG_DRY_RUN_PATH, {
        body: {
          confirmation: PUBLIC_CATALOG_DRY_RUN_CONFIRMATION
        },
        method: "POST",
        timeoutMs: 45000
      });
      const dryRun = parsePublicCatalogDryRunResult(response?.data);

      renderPublicCatalogDryRun(dryRun);
      statusRegion.textContent = dryRun.status === "ready"
        ? "Публичный каталог: READY dry-run."
        : "Публичный каталог: BLOCKED dry-run.";
    } catch (error) {
      renderError(publicCatalogStatus, documentRef, error);
      statusRegion.textContent = "Не удалось проверить публичный каталог.";
    } finally {
      publicCatalogBusy = false;
      setPublicCatalogButtonsBusy(false);
    }
  }

  function openPublicCatalogSyncDialog(invoker) {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmationText: PUBLIC_CATALOG_SYNC_CONFIRMATION,
      confirmLabel: "Синхронизировать",
      description:
        "Backend создаст новую публичную версию snapshot только после проверки immutable файла и manifest.",
      documentRef,
      onConfirm: runPublicCatalogSync,
      title: "Синхронизировать публичный каталог"
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  function openPublicCatalogDryRunDialog(invoker) {
    if (role !== "admin" || publicCatalogBusy) {
      return;
    }

    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmationText: PUBLIC_CATALOG_DRY_RUN_CONFIRMATION,
      confirmLabel: "Проверить",
      description:
        "Backend построит будущий snapshot в read-only режиме без публикации, DB-записей и Storage.",
      documentRef,
      onConfirm: runPublicCatalogDryRun,
      title: "Проверить публичный каталог без публикации"
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  async function runDryRun() {
    if (role !== "admin" || checking || mutationBusy) {
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    checking = true;
    applyReady = false;
    latestReport = null;
    updateApplyState();
    setBusy(checkButton, true);
    statusRegion.textContent = "Проверяем canonical assets...";
    renderLoading();

    try {
      const response = await apiClient.requestJson(CANONICAL_ASSETS_DRY_RUN_PATH, {
        method: "GET",
        signal: controller.signal,
        timeoutMs: ADMIN_REQUEST_TIMEOUTS.jsonGet
      });

      if (destroyed || controller.signal.aborted) {
        return;
      }

      latestReport = parseMaintenanceReport(response?.data, { expectedMode: "dry-run" });
      applyReady = latestReport.status === "ready" && latestReport.blockers.length === 0;
      renderReport(latestReport);
      const message = latestReport.status === "ready"
        ? "Проверка готова. Apply доступен после подтверждения."
        : "Проверка завершена с blockers.";
      statusRegion.textContent = message;
      onStatus(message);
    } catch (error) {
      if (destroyed || controller.signal.aborted) {
        return;
      }

      applyReady = false;
      latestReport = null;
      renderError(results, documentRef, error);
      statusRegion.textContent = "Не удалось проверить canonical assets.";
      onStatus("Не удалось проверить canonical assets.");
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
      checking = false;
      setBusy(checkButton, false);
      updateApplyState();
    }
  }

  function openApplyDialog(invoker) {
    if (!canApply()) {
      return;
    }

    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      confirmationText: CANONICAL_ASSETS_CONFIRMATION,
      confirmLabel: "Восстановить",
      description:
        "Backend повторно проверит состояние карточек внутри транзакции. Карточки не будут опубликованы.",
      documentRef,
      onConfirm: submitApply,
      title: "Восстановить канонические изображения"
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  async function submitApply() {
    mutationBusy = true;
    applyReady = false;
    updateApplyState();

    try {
      const response = await apiClient.requestJson(CANONICAL_ASSETS_APPLY_PATH, {
        body: {
          confirmation: CANONICAL_ASSETS_CONFIRMATION
        },
        method: "POST",
        timeoutMs: ADMIN_REQUEST_TIMEOUTS.jsonMutation
      });

      if (destroyed) {
        return;
      }

      const report = parseMaintenanceReport(response?.data, { expectedMode: "apply" });
      if (report.status === "blocked") {
        throw maintenanceError("RECONCILIATION_PRECONDITION_FAILED", applyStatusMessage(report));
      }
      if (report.status !== "applied" && report.status !== "already-reconciled") {
        throw invalidResponseError();
      }

      latestReport = report;
      renderReport(latestReport);
      const message = applyStatusMessage(latestReport);
      statusRegion.textContent = message;
      onStatus(message);
    } catch (error) {
      throw toSafeDialogError(error);
    } finally {
      mutationBusy = false;
      updateApplyState();
    }
  }

  function renderForbidden() {
    replaceContent(results, createElement("p", {
      documentRef,
      text: "Недостаточно прав для выполнения обслуживания."
    }));
    statusRegion.textContent = "Недостаточно прав.";
    onStatus("Недостаточно прав.");
  }

  function renderLoading() {
    replaceContent(results, createElement("p", {
      documentRef,
      text: "Загрузка maintenance dry-run..."
    }));
  }

  function renderReport(report) {
    const blockers = Array.isArray(report.blockers) ? report.blockers : [];
    const summary = createElement("div", {
      documentRef,
      className: "admin-maintenance-summary",
      children: [
        createElement("p", {
          documentRef,
          text: `Статус: ${report.status}`
        }),
        createElement("p", {
          documentRef,
          text: `Планируемые preview: ${report.totals.plannedPreviewUpdates}`
        }),
        createElement("p", {
          documentRef,
          text: `Планируемые gallery URL: ${report.totals.plannedGalleryUrlUpdates}`
        }),
        createElement("p", {
          documentRef,
          text: `Целевые карточки: ${report.totals.targetSites}`
        })
      ]
    });
    const children = [summary, renderTargets(report.targets)];

    if (blockers.length > 0) {
      children.push(renderBlockers(blockers));
    }
    if (typeof report.message === "string" && report.message.length > 0) {
      children.push(createElement("p", {
        documentRef,
        text: report.message
      }));
    }

    replaceContent(results, ...children);
  }

  function renderTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
      return createElement("p", {
        documentRef,
        text: "Целевые карточки не найдены в отчёте."
      });
    }

    return createElement("table", {
      documentRef,
      className: "admin-data-table admin-maintenance-table",
      children: [
        createElement("thead", {
          documentRef,
          children: [
            createElement("tr", {
              documentRef,
              children: [
                tableHead(documentRef, "Slug"),
                tableHead(documentRef, "Status"),
                tableHead(documentRef, "Preview"),
                tableHead(documentRef, "Gallery URL"),
                tableHead(documentRef, "Blockers")
              ]
            })
          ]
        }),
        createElement("tbody", {
          documentRef,
          children: targets.map((target) => createElement("tr", {
            documentRef,
            children: [
              tableCell(documentRef, "Slug", target.slug ?? ""),
              tableCell(documentRef, "Status", target.status ?? ""),
              tableCell(documentRef, "Preview", previewStateLabel(target)),
              tableCell(documentRef, "Gallery URL", target.plannedGalleryUrlUpdates ?? 0),
              tableCell(documentRef, "Blockers", Array.isArray(target.blockers) ? target.blockers.join(", ") : "")
            ]
          }))
        })
      ]
    });
  }

  function renderBlockers(blockers) {
    return createElement("section", {
      documentRef,
      className: "admin-maintenance-blockers",
      children: [
        createElement("h3", {
          documentRef,
          text: "Blockers"
        }),
        createElement("ul", {
          documentRef,
          children: blockers.map((blocker) => createElement("li", {
            documentRef,
            text: blocker
          }))
        })
      ]
    });
  }

  function updateApplyState() {
    const disabled = !canApply();
    applyButton.disabled = disabled;
    if (disabled) {
      applyButton.setAttribute("disabled", "");
      return;
    }

    applyButton.removeAttribute?.("disabled");
  }

  function canApply() {
    return role === "admin" &&
      !checking &&
      !mutationBusy &&
      applyReady &&
      latestReport !== null &&
      latestReport.status === "ready" &&
      Array.isArray(latestReport.blockers) &&
      latestReport.blockers.length === 0;
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
  }

  function setPublicCatalogButtonsBusy(busy) {
    setBusy(publicCatalogCheckButton, busy);
    setBusy(publicCatalogSaveButton, busy);
    setBusy(publicCatalogDryRunButton, busy);
    setBusy(publicCatalogSyncButton, busy);
  }

  function renderPublicCatalogStatus(status, sync) {
    publicCatalogToggle.checked = status.showDemoInModal === true;
    replaceContent(publicCatalogStatus, createElement("div", {
      documentRef,
      className: "admin-maintenance-summary",
      children: [
        createElement("p", {
          documentRef,
          text: `DB mutation result: ${status.syncStatus}`
        }),
        createElement("p", {
          documentRef,
          text: `Revision: desired ${status.desiredRevision}, published ${status.publishedRevision}`
        }),
        createElement("p", {
          documentRef,
          text: `Snapshot: ${status.currentSnapshotPath ?? "ещё не опубликован"}`
        }),
        ...(sync === undefined ? [] : [publicCatalogSyncElement(sync)])
      ]
    }));
  }

  function renderPublicCatalogSync(sync) {
    replaceContent(publicCatalogStatus, publicCatalogSyncElement(sync));
  }

  function renderPublicCatalogDryRun(dryRun) {
    if (dryRun.status === "ready") {
      replaceContent(publicCatalogStatus, createElement("section", {
        documentRef,
        className: "admin-maintenance-summary",
        children: [
          createElement("p", {
            documentRef,
            text: "Public catalog dry-run: READY"
          }),
          createElement("p", {
            documentRef,
            text: `requestId ${dryRun.requestId}`
          }),
          createElement("p", {
            documentRef,
            text: `Revision ${dryRun.revision}, items ${dryRun.itemsCount}`
          }),
          createElement("p", {
            documentRef,
            text: `Bytes ${dryRun.byteLength}, checksum ${dryRun.sha256}`
          })
        ]
      }));
      return;
    }

    replaceContent(publicCatalogStatus, createElement("section", {
      documentRef,
      className: "admin-maintenance-summary",
      children: [
        createElement("p", {
          documentRef,
          text: "Public catalog dry-run: BLOCKED"
        }),
        createElement("p", {
          documentRef,
          text: `requestId ${dryRun.requestId}`
        }),
        createElement("p", {
          documentRef,
          text: `Blockers ${dryRun.blockers.length}${dryRun.blockersTruncated ? " (truncated)" : ""}`
        }),
        renderPublicCatalogDryRunBlockers(dryRun.blockers)
      ]
    }));
  }

  function renderPublicCatalogDryRunBlockers(blockers) {
    if (blockers.length === 0) {
      return createElement("p", {
        documentRef,
        text: "Blockers не переданы."
      });
    }

    return createElement("table", {
      documentRef,
      className: "admin-data-table admin-maintenance-table",
      children: [
        createElement("thead", {
          documentRef,
          children: [
            createElement("tr", {
              documentRef,
              children: [
                tableHead(documentRef, "Card"),
                tableHead(documentRef, "Field"),
                tableHead(documentRef, "Reason")
              ]
            })
          ]
        }),
        createElement("tbody", {
          documentRef,
          children: blockers.map((blocker) => createElement("tr", {
            documentRef,
            children: [
              tableCell(documentRef, "Card", blocker.slug ?? blocker.siteId ?? ""),
              tableCell(documentRef, "Field", blocker.fieldPath ?? ""),
              tableCell(documentRef, "Reason", blocker.reasonCode)
            ]
          }))
        })
      ]
    });
  }

  function publicCatalogSyncElement(sync) {
    return createElement("section", {
      documentRef,
      className: "admin-maintenance-summary",
      children: [
        createElement("p", {
          documentRef,
          text: `Public snapshot sync result: ${sync.status}`
        }),
        createElement("p", {
          documentRef,
          text: sync.status === "ready"
            ? `Published revision ${sync.publishedRevision}, items ${sync.itemsCount}`
            : sync.status === "failed"
              ? `Failed requestId ${sync.requestId}, code ${sync.errorCode}`
              : `Pending revision ${sync.desiredRevision}`
        })
      ]
    });
  }

  function publicCatalogSyncMessage(sync) {
    if (sync.status === "ready") {
      return "Публичный каталог: READY.";
    }
    if (sync.status === "failed") {
      return `Публичный каталог: FAILED. requestId ${sync.requestId}`;
    }
    return "Публичный каталог: PENDING.";
  }

  return {
    destroy,
    element,
    isMutationBusy,
    load
  };
}

function parseMaintenanceReport(report, options = {}) {
  if (!isRecord(report)) {
    throw invalidResponseError();
  }

  const mode = report.mode;
  if (mode !== "dry-run" && mode !== "apply") {
    throw invalidResponseError();
  }
  if (options.expectedMode !== undefined && mode !== options.expectedMode) {
    throw invalidResponseError();
  }

  const status = report.status;
  if (
    status !== "ready" &&
    status !== "applied" &&
    status !== "already-reconciled" &&
    status !== "blocked"
  ) {
    throw invalidResponseError();
  }
  if (mode === "apply" && status === "ready") {
    throw invalidResponseError();
  }

  const blockers = readStringArray(report.blockers);
  const targets = readTargets(report.targets);
  const totals = readTotals(report.totals);

  if (blockers === null || targets === null || totals === null) {
    throw invalidResponseError();
  }
  if (status === "applied" && totals.appliedSiteUpdates <= 0) {
    throw invalidResponseError();
  }
  if (status === "already-reconciled" && totals.appliedSiteUpdates !== 0) {
    throw invalidResponseError();
  }

  return {
    blockers,
    message: typeof report.message === "string" ? report.message : "",
    mode,
    status,
    targets,
    totals
  };
}

function parsePublicCatalogStatus(value) {
  if (!isRecord(value)) {
    throw invalidResponseError();
  }

  const syncStatus = value.syncStatus;
  if (
    syncStatus !== "pending" &&
    syncStatus !== "syncing" &&
    syncStatus !== "ready" &&
    syncStatus !== "failed"
  ) {
    throw invalidResponseError();
  }

  const desiredRevision = readNonNegativeInteger(value.desiredRevision);
  const publishedRevision = readNonNegativeInteger(value.publishedRevision);
  if (desiredRevision === null || publishedRevision === null) {
    throw invalidResponseError();
  }

  const currentItemsCount =
    value.currentItemsCount === null ? null : readNonNegativeInteger(value.currentItemsCount);
  if (currentItemsCount === null && value.currentItemsCount !== null) {
    throw invalidResponseError();
  }

  return {
    currentItemsCount,
    currentSnapshotChecksum:
      typeof value.currentSnapshotChecksum === "string" ? value.currentSnapshotChecksum : null,
    currentSnapshotPath:
      typeof value.currentSnapshotPath === "string" ? value.currentSnapshotPath : null,
    desiredRevision,
    lastSyncErrorCode:
      typeof value.lastSyncErrorCode === "string" ? value.lastSyncErrorCode : null,
    lastSyncRequestId:
      typeof value.lastSyncRequestId === "string" ? value.lastSyncRequestId : null,
    publishedRevision,
    showDemoInModal: value.showDemoInModal === true,
    syncStatus
  };
}

function parsePublicCatalogSettingsResult(value) {
  if (!isRecord(value)) {
    throw invalidResponseError();
  }

  return {
    status: parsePublicCatalogStatus(value.status),
    sync: parsePublicCatalogSyncResult(value.sync)
  };
}

function parsePublicCatalogSyncResult(value) {
  if (!isRecord(value)) {
    throw invalidResponseError();
  }

  if (value.status === "ready") {
    const publishedRevision = readNonNegativeInteger(value.publishedRevision);
    const itemsCount = readNonNegativeInteger(value.itemsCount);
    if (
      publishedRevision === null ||
      itemsCount === null ||
      typeof value.checksum !== "string" ||
      typeof value.requestId !== "string" ||
      typeof value.snapshotPath !== "string"
    ) {
      throw invalidResponseError();
    }

    return {
      checksum: value.checksum,
      itemsCount,
      publishedRevision,
      requestId: value.requestId,
      snapshotPath: value.snapshotPath,
      status: "ready"
    };
  }

  if (value.status === "failed") {
    const publishedRevision = readNonNegativeInteger(value.publishedRevision);
    if (
      publishedRevision === null ||
      typeof value.errorCode !== "string" ||
      typeof value.requestId !== "string"
    ) {
      throw invalidResponseError();
    }

    return {
      errorCode: value.errorCode,
      publishedRevision,
      requestId: value.requestId,
      status: "failed"
    };
  }

  if (value.status === "pending") {
    const desiredRevision = readNonNegativeInteger(value.desiredRevision);
    const publishedRevision = readNonNegativeInteger(value.publishedRevision);
    if (
      desiredRevision === null ||
      publishedRevision === null ||
      typeof value.requestId !== "string"
    ) {
      throw invalidResponseError();
    }

    return {
      desiredRevision,
      publishedRevision,
      requestId: value.requestId,
      status: "pending"
    };
  }

  throw invalidResponseError();
}

function parsePublicCatalogDryRunResult(value) {
  if (!isRecord(value)) {
    throw invalidResponseError();
  }

  const durationMs = readNonNegativeInteger(value.durationMs);
  const itemsCount = readNonNegativeInteger(value.itemsCount);
  const revision = readNonNegativeInteger(value.revision);
  if (
    durationMs === null ||
    itemsCount === null ||
    revision === null ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    !Array.isArray(value.blockers) ||
    typeof value.blockersTruncated !== "boolean"
  ) {
    throw invalidResponseError();
  }

  const blockers = value.blockers.map(parsePublicCatalogDryRunBlocker);
  if (blockers.some((blocker) => blocker === null)) {
    throw invalidResponseError();
  }

  if (value.status === "ready") {
    const byteLength = readNonNegativeInteger(value.byteLength);
    if (
      byteLength === null ||
      blockers.length !== 0 ||
      value.blockersTruncated !== false ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sha256)
    ) {
      throw invalidResponseError();
    }

    return {
      blockers: [],
      blockersTruncated: false,
      byteLength,
      durationMs,
      itemsCount,
      requestId: value.requestId,
      revision,
      sha256: value.sha256,
      status: "ready"
    };
  }

  if (value.status === "blocked") {
    if (value.byteLength !== null || value.sha256 !== null) {
      throw invalidResponseError();
    }

    return {
      blockers,
      blockersTruncated: value.blockersTruncated,
      byteLength: null,
      durationMs,
      itemsCount,
      requestId: value.requestId,
      revision,
      sha256: null,
      status: "blocked"
    };
  }

  throw invalidResponseError();
}

function parsePublicCatalogDryRunBlocker(value) {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.errorCode !== "PUBLIC_CATALOG_DRY_RUN_BLOCKED" ||
    !isNullableString(value.fieldPath) ||
    !isNullableString(value.siteId) ||
    !isNullableString(value.slug) ||
    !isNullableNonNegativeInteger(value.itemIndex) ||
    typeof value.reasonCode !== "string" ||
    typeof value.stage !== "string"
  ) {
    return null;
  }

  return {
    errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED",
    fieldPath: value.fieldPath,
    itemIndex: value.itemIndex,
    reasonCode: value.reasonCode,
    siteId: value.siteId,
    slug: value.slug,
    stage: value.stage
  };
}

function applyStatusMessage(report) {
  if (report.status === "applied") {
    return "Канонические изображения восстановлены. Карточки остались черновиками и не опубликованы.";
  }
  if (report.status === "already-reconciled") {
    return "Канонические изображения уже восстановлены.";
  }
  if (report.status === "blocked") {
    return APPLY_BLOCKED_MESSAGE;
  }

  return UNEXPECTED_APPLY_FAILURE_MESSAGE;
}

function renderError(container, documentRef, error) {
  const children = [
    createElement("p", {
      documentRef,
      text: safeErrorMessage(error)
    })
  ];
  const requestId = safeRequestId(error);

  if (requestId !== null) {
    children.push(createRequestIdControl(requestId, { documentRef }));
  }

  replaceContent(container, ...children);
}

function toSafeDialogError(error) {
  const next = new Error(safeErrorMessage(error));
  next.code = typeof error?.code === "string" ? error.code : "MAINTENANCE_FAILED";
  next.requestId = safeRequestId(error);

  return next;
}

function safeErrorMessage(error) {
  if (error?.code === "INTERNAL_ERROR" || error?.status >= 500) {
    return UNEXPECTED_APPLY_FAILURE_MESSAGE;
  }

  const message = typeof error?.message === "string" && error.message.length > 0
    ? error.message
    : "";

  if (message.length > 0 && !SAFE_TECHNICAL_ERROR_PATTERN.test(message)) {
    return message;
  }

  return UNEXPECTED_APPLY_FAILURE_MESSAGE;
}

function safeRequestId(error) {
  return typeof error?.requestId === "string" && error.requestId.length > 0
    ? error.requestId
    : null;
}

function tableHead(documentRef, text) {
  return createElement("th", {
    documentRef,
    text,
    attributes: {
      scope: "col"
    }
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

function previewStateLabel(target) {
  if (target.previewState === "missing") {
    return "Preview отсутствует";
  }
  if (target.previewState === "legacy-canonical") {
    return "Legacy Preview будет нормализован";
  }
  if (target.previewState === "already-canonical") {
    return "Preview уже канонический";
  }
  if (target.previewState === "blocked") {
    return "Конфликт Preview";
  }

  return target.plannedPreviewUpdate === true
    ? "Preview будет обновлён"
    : "Preview не определён";
}

function readStringArray(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }

  return [...value];
}

function readTargets(value) {
  if (!Array.isArray(value) || value.length !== EXPECTED_TARGET_SLUGS.length) {
    return null;
  }

  const targets = [];
  for (let index = 0; index < EXPECTED_TARGET_SLUGS.length; index += 1) {
    const target = value[index];
    if (!isRecord(target) || target.slug !== EXPECTED_TARGET_SLUGS[index]) {
      return null;
    }
    if (readStringArray(target.blockers) === null) {
      return null;
    }
    if (!EXPECTED_PREVIEW_STATES.includes(target.previewState)) {
      return null;
    }
    if (typeof target.plannedPreviewUpdate !== "boolean") {
      return null;
    }
    if (readNonNegativeInteger(target.plannedGalleryUrlUpdates) === null) {
      return null;
    }
    targets.push(target);
  }

  return targets;
}

function readTotals(value) {
  if (!isRecord(value)) {
    return null;
  }

  const totals = {
    appliedSiteUpdates: readNonNegativeInteger(value.appliedSiteUpdates),
    plannedGalleryUrlUpdates: readNonNegativeInteger(value.plannedGalleryUrlUpdates),
    plannedPreviewUpdates: readNonNegativeInteger(value.plannedPreviewUpdates),
    targetSites: readNonNegativeInteger(value.targetSites)
  };

  if (Object.values(totals).some((item) => item === null)) {
    return null;
  }
  if (totals.targetSites !== EXPECTED_TARGET_SLUGS.length) {
    return null;
  }

  return totals;
}

function readNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isNullableNonNegativeInteger(value) {
  return value === null || readNonNegativeInteger(value) !== null;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function invalidResponseError() {
  return maintenanceError("INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
}

function maintenanceError(code, message) {
  const error = new Error(message);
  error.code = code;

  return error;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
