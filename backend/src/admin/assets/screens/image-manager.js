import {
  createElement,
  createLiveRegion,
  createRequestIdControl,
  replaceContent,
  setBusy
} from "../dom.js";
import { createConfirmationDialog } from "../dialog.js";
import { resolveCatalogAssetUrl } from "../catalog-asset-url.js";
import {
  IMAGE_UPLOAD_LIMITS,
  assertGalleryCapacity,
  buildGalleryBatchFormData,
  buildImagePath,
  buildPreviewFormData,
  createRandomUuid,
  normalizeAlt,
  normalizeGalleryBatchResult,
  readSingleFile,
  selectedNames,
  supportedImageTypes,
  validateBatch,
  validateImageFile,
  validateUuid
} from "../site-image-upload.js";

export {
  IMAGE_UPLOAD_LIMITS,
  buildGalleryBatchFormData,
  buildImagePath,
  buildPreviewFormData,
  supportedImageTypes
} from "../site-image-upload.js";

export function createImageManagerScreen(options) {
  const documentRef = options?.documentRef ?? document;
  const apiClient = options?.apiClient;
  const role = options?.role === "admin" ? "admin" : "editor";
  const siteId = validateUuid(options?.siteId, "site");
  const onBack = typeof options?.onBack === "function" ? options.onBack : () => {};
  const onSiteUpdated = typeof options?.onSiteUpdated === "function" ? options.onSiteUpdated : () => {};
  const onStatus = typeof options?.onStatus === "function" ? options.onStatus : () => {};
  const uuidFactory = typeof options?.uuidFactory === "function" ? options.uuidFactory : createRandomUuid;
  let activeController = null;
  let currentDialog = null;
  let currentSite = null;
  let destroyed = false;
  let mutationBusy = false;

  const statusRegion = createLiveRegion({
    className: "admin-screen-status",
    documentRef
  });
  const content = createElement("section", {
    documentRef,
    className: "admin-image-content"
  });
  const dialogHost = createElement("section", {
    documentRef,
    className: "admin-dialog-host"
  });
  const element = createElement("section", {
    documentRef,
    className: "admin-image-manager",
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
                text: "Изображения"
              }),
              createElement("h2", {
                documentRef,
                text: "Главное изображение и галерея"
              })
            ]
          }),
          createElement("button", {
            documentRef,
            text: "Назад",
            attributes: {
              "data-action": "back-to-sites",
              type: "button"
            },
            on: {
              click: onBack
            }
          })
        ]
      }),
      statusRegion,
      content,
      dialogHost
    ]
  });

  async function load() {
    abortActiveRequest();
    const controller = new AbortController();
    activeController = controller;
    renderLoading();

    try {
      const response = await apiClient.requestJson(sitePath(siteId), {
        method: "GET",
        signal: controller.signal
      });

      if (controller.signal.aborted || destroyed) {
        return;
      }

      currentSite = response?.data ?? null;
      render();
      setStatus("Изображения загружены.");
    } catch (error) {
      if (controller.signal.aborted || destroyed) {
        return;
      }

      renderError(error);
    }
  }

  function destroy() {
    destroyed = true;
    abortActiveRequest();
    currentDialog?.destroy();
    currentDialog = null;
    clearFileInputs();
  }

  function abortActiveRequest() {
    if (activeController !== null) {
      activeController.abort();
      activeController = null;
    }
  }

  function renderLoading() {
    replaceContent(content, createElement("p", {
      documentRef,
      className: "admin-state",
      text: "Загрузка изображений..."
    }));
  }

  function render() {
    if (currentSite === null) {
      renderLoading();
      return;
    }

    const canMutate = canManageImages(currentSite, role);
    const canCleanupDeleted = canCleanupDeletedSiteImages(currentSite, role);
    replaceContent(content,
      createElement("p", {
        documentRef,
        className: "admin-image-title",
        text: `${currentSite.title ?? currentSite.slug ?? currentSite.id}`
      }),
      ...(canCleanupDeleted ? [
        createElement("p", {
          documentRef,
          className: "admin-state admin-image-cleanup-state",
          text: "Карточка удалена. Доступна только очистка изображений перед окончательным удалением."
        })
      ] : []),
      createPreviewSection(canMutate, canMutate || canCleanupDeleted),
      createGallerySection(canMutate, canMutate || canCleanupDeleted),
      ...(canMutate || canCleanupDeleted ? [] : [
        createElement("p", {
          documentRef,
          className: "admin-state",
          text: "Изображениями нельзя управлять в текущем состоянии сайта."
        })
      ])
    );
  }

  function createPreviewSection(canMutate, canDelete) {
    const previewResolution = resolveImageUrl(currentSite?.previewImage?.url ?? currentSite?.previewImageUrl);
    const previewUrl = previewResolution?.url ?? null;

    return createElement("section", {
      documentRef,
      className: "admin-image-section",
      children: [
        createElement("h3", {
          documentRef,
          text: "Главное изображение"
        }),
        previewUrl === null
          ? createElement("p", {
              documentRef,
              className: "admin-state",
              text: "Главное изображение не задано."
            })
          : createElement("div", {
              documentRef,
              className: "admin-preview-card",
              children: [
                createElement("img", {
                  documentRef,
                  attributes: {
                    alt: currentSite?.title ?? "",
                    src: previewUrl
                  }
                }),
                createElement("p", {
                  documentRef,
                  text: previewUrl
                }),
                ...legacyAssetMarker(previewResolution, documentRef)
              ]
            }),
        ...(canMutate ? [
          createPreviewForm(),
        ] : []),
        ...(canDelete && previewUrl !== null ? [createElement("button", {
            documentRef,
            text: "Удалить главное изображение",
            attributes: {
              "data-action": "delete-preview",
              type: "button"
            },
            on: {
              click: (event) => openDeletePreviewDialog(event.currentTarget ?? event.target)
            }
        })] : [])
      ]
    });
  }

  function createPreviewForm() {
    const fileInput = createElement("input", {
      documentRef,
      attributes: {
        accept: supportedImageTypes.join(","),
        name: "previewImage",
        type: "file"
      }
    });
    const altInput = createElement("input", {
      documentRef,
      attributes: {
        autocomplete: "off",
        maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt),
        name: "previewAlt",
        type: "text"
      }
    });
    const selection = createElement("p", {
      documentRef,
      className: "admin-upload-selection"
    });
    const form = createElement("form", {
      documentRef,
      className: "admin-upload-form",
      attributes: {
        "data-action": "replace-preview"
      },
      children: [
        labeled("Главное изображение", fileInput),
        labeled("Описание главного изображения", altInput),
        selection,
        createElement("button", {
          documentRef,
          text: "Заменить главное изображение",
          attributes: {
            type: "submit"
          }
        })
      ]
    });

    fileInput.addEventListener("change", () => {
      selection.textContent = selectedNames(fileInput.files);
    });
    form.addEventListener("submit", (event) => {
      void submitPreview(event, form, fileInput, altInput, selection);
    });

    return form;
  }

  function createGallerySection(canMutate, canDelete) {
    const gallery = readGallery(currentSite);

    return createElement("section", {
      documentRef,
      className: "admin-image-section",
      children: [
        createElement("h3", {
          documentRef,
          text: "Галерея"
        }),
        gallery.length === 0
          ? createElement("p", {
              documentRef,
              className: "admin-state",
              text: "Галерея пустая."
            })
          : createGalleryList(gallery, canMutate, canDelete),
        ...(canMutate ? [
          createGallerySingleForm(),
          createGalleryBatchForm()
        ] : [])
      ]
    });
  }

  function createGalleryList(gallery, canMutate, canDelete) {
    const rows = gallery.map((image) => createGalleryItem(image, canDelete));

    return createElement("div", {
      documentRef,
      className: "admin-gallery-list",
      children: [
        ...rows,
        ...(canMutate ? [createGalleryReorderForm(gallery)] : [])
      ]
    });
  }

  function createGalleryItem(image, canDelete) {
    const imageResolution = resolveImageUrl(image.url);
    const imageUrl = imageResolution?.url ?? null;
    const imageNode = imageUrl === null
      ? createElement("p", {
          documentRef,
          className: "admin-state",
          text: "URL изображения недоступен."
        })
      : createElement("img", {
          documentRef,
          attributes: {
            alt: image.alt ?? "",
            src: imageUrl
          }
        });

    return createElement("article", {
      documentRef,
      className: "admin-gallery-item",
      attributes: {
        "data-gallery-asset": image.assetId
      },
      children: [
        createElement("div", {
          documentRef,
          className: "admin-gallery-image-area",
          attributes: {
            "data-gallery-area": "image"
          },
          children: [imageNode]
        }),
        createElement("div", {
          documentRef,
          className: "admin-gallery-legacy-marker",
          attributes: {
            "data-gallery-area": "legacy-marker"
          },
          children: legacyAssetMarker(imageResolution, documentRef)
        }),
        createElement("div", {
          documentRef,
          className: "admin-gallery-metadata",
          attributes: {
            "data-gallery-area": "metadata"
          },
          children: [
            createElement("p", {
              documentRef,
              text: image.alt ?? ""
            }),
            createElement("p", {
              documentRef,
              text: `Порядок: ${image.sortOrder ?? 0}`
            })
          ]
        }),
        createElement("div", {
          documentRef,
          className: "admin-gallery-item-actions",
          attributes: {
            "data-gallery-area": "actions"
          },
          children: canDelete ? [
            createElement("button", {
              documentRef,
              text: "Удалить изображение",
              attributes: {
                "data-action": "delete-gallery-image",
                "data-asset-id": image.assetId,
                type: "button"
              },
              on: {
                click: (event) => openDeleteGalleryDialog(image, event.currentTarget ?? event.target)
              }
            })
          ] : []
        })
      ]
    });
  }

  function createGalleryReorderForm(gallery) {
    const controls = gallery.map((image) => createElement("fieldset", {
      documentRef,
      className: "admin-gallery-reorder-item",
      children: [
        createElement("legend", {
          documentRef,
          text: image.assetId
        }),
        labeled("Порядок", createElement("input", {
          documentRef,
          attributes: {
            "data-asset-id": image.assetId,
            inputmode: "numeric",
            min: "0",
            name: "gallerySortOrder",
            step: "1",
            type: "number",
            value: String(image.sortOrder ?? 0)
          }
        })),
        labeled("Описание изображения", createElement("input", {
          documentRef,
          attributes: {
            "data-asset-id": image.assetId,
            autocomplete: "off",
            maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt),
            name: "galleryItemAlt",
            type: "text",
            value: image.alt ?? ""
          }
        }))
      ]
    }));
    const form = createElement("form", {
      documentRef,
      className: "admin-gallery-reorder-form",
      attributes: {
        "data-action": "reorder-gallery"
      },
      children: [
        ...controls,
        createElement("button", {
          documentRef,
          text: "Сохранить порядок",
          attributes: {
            type: "submit"
          }
        })
      ]
    });

    form.addEventListener("submit", (event) => {
      void submitGalleryReorder(event, form);
    });

    return form;
  }

  function createGallerySingleForm() {
    const fileInput = createElement("input", {
      documentRef,
      attributes: {
        accept: supportedImageTypes.join(","),
        name: "galleryImage",
        type: "file"
      }
    });
    const altInput = createElement("input", {
      documentRef,
      attributes: {
        autocomplete: "off",
        maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt),
        name: "galleryAlt",
        type: "text"
      }
    });
    const selection = createElement("p", {
      documentRef,
      className: "admin-upload-selection"
    });
    const form = createElement("form", {
      documentRef,
      className: "admin-upload-form",
      attributes: {
        "data-action": "add-gallery-single"
      },
      children: [
        labeled("Изображение галереи", fileInput),
        labeled("Описание изображения", altInput),
        selection,
        createElement("button", {
          documentRef,
          text: "Добавить изображение",
          attributes: {
            type: "submit"
          }
        })
      ]
    });

    fileInput.addEventListener("change", () => {
      selection.textContent = selectedNames(fileInput.files);
    });
    form.addEventListener("submit", (event) => {
      void submitGallerySingle(event, form, fileInput, altInput, selection);
    });

    return form;
  }

  function createGalleryBatchForm() {
    const fileInput = createElement("input", {
      documentRef,
      attributes: {
        accept: supportedImageTypes.join(","),
        multiple: true,
        name: "galleryBatchImages",
        type: "file"
      }
    });
    const altInput = createElement("input", {
      documentRef,
      attributes: {
        autocomplete: "off",
        maxlength: String(IMAGE_UPLOAD_LIMITS.imageAlt),
        name: "galleryBatchAlt",
        type: "text"
      }
    });
    const selection = createElement("p", {
      documentRef,
      className: "admin-upload-selection"
    });
    const form = createElement("form", {
      documentRef,
      className: "admin-upload-form",
      attributes: {
        "data-action": "add-gallery-batch"
      },
      children: [
        labeled("Выбрать несколько изображений", fileInput),
        labeled("Общее описание выбранных изображений", altInput),
        selection,
        createElement("button", {
          documentRef,
          text: "Загрузить выбранные изображения",
          attributes: {
            type: "submit"
          }
        })
      ]
    });

    fileInput.addEventListener("change", () => {
      selection.textContent = selectedNames(fileInput.files);
    });
    form.addEventListener("submit", (event) => {
      void submitGalleryBatch(event, form, fileInput, altInput, selection);
    });

    return form;
  }

  async function submitPreview(event, form, fileInput, altInput, selection) {
    event.preventDefault();
    if (!beginMutation(form)) {
      return;
    }

    try {
      const file = readSingleFile(fileInput, "Главное");
      const alt = normalizeAlt(altInput.value);
      validateImageFile(file);
      const response = await apiClient.requestMultipart(buildImagePath(siteId, "preview"), {
        body: buildPreviewFormData({
          alt,
          clientFileId: uuidFactory(),
          file
        }),
        method: "PUT"
      });
      if (destroyed) {
        return;
      }

      const previewImage = response?.data?.previewImage ?? null;
      currentSite = {
        ...currentSite,
        previewImage,
        previewImageUrl: previewImage?.url ?? null
      };
      onSiteUpdated(currentSite);
      render();
      setStatus("Главное изображение обновлено.");
    } catch (error) {
      showInlineError(error);
      selection.textContent = selectedNames(fileInput.files);
    } finally {
      endMutation(form);
    }
  }

  async function submitGallerySingle(event, form, fileInput, altInput, selection) {
    event.preventDefault();
    if (!beginMutation(form)) {
      return;
    }

    try {
      const file = readSingleFile(fileInput, "Галерейное");
      const alt = normalizeAlt(altInput.value);
      validateImageFile(file);
      assertGalleryCapacity(readGallery(currentSite), 1);
      const response = await apiClient.requestMultipart(buildImagePath(siteId, "gallery"), {
        body: buildPreviewFormData({
          alt,
          clientFileId: uuidFactory(),
          file
        }),
        method: "POST"
      });
      if (destroyed) {
        return;
      }

      currentSite = {
        ...currentSite,
        galleryImages: [...readGallery(currentSite), response?.data?.image].filter(Boolean)
      };
      onSiteUpdated(currentSite);
      render();
      setStatus("Изображение галереи добавлено.");
    } catch (error) {
      showInlineError(error);
      selection.textContent = selectedNames(fileInput.files);
    } finally {
      endMutation(form);
    }
  }

  async function submitGalleryBatch(event, form, fileInput, altInput, selection) {
    event.preventDefault();
    if (!beginMutation(form)) {
      return;
    }

    try {
      const files = Array.from(fileInput.files ?? []);
      const alt = normalizeAlt(altInput.value);
      validateBatch(files);
      assertGalleryCapacity(readGallery(currentSite), files.length);
      const clientFileIds = files.map(() => uuidFactory());
      const response = await apiClient.requestMultipart(buildImagePath(siteId, "gallery-batch"), {
        body: buildGalleryBatchFormData({
          alt,
          clientFileIds,
          files
        }),
        method: "POST"
      });
      if (destroyed) {
        return;
      }

      const result = normalizeGalleryBatchResult(response?.data, {
        clientFileIds,
        files
      });
      currentSite = {
        ...currentSite,
        galleryImages: [
          ...readGallery(currentSite),
          ...result.succeeded.map((item) => item.image).filter(Boolean)
        ]
      };
      onSiteUpdated(currentSite);
      render();
      renderBatchResult(result);
    } catch (error) {
      showInlineError(error);
      selection.textContent = selectedNames(fileInput.files);
    } finally {
      endMutation(form);
    }
  }

  async function submitGalleryReorder(event, form) {
    event.preventDefault();
    if (!beginMutation(form)) {
      return;
    }

    try {
      const payload = buildGalleryReorderPayload(readGallery(currentSite).map((image) => ({
        ...image,
        alt: readValueForAsset(form, "galleryItemAlt", image.assetId),
        sortOrder: readValueForAsset(form, "gallerySortOrder", image.assetId)
      })));
      const response = await apiClient.requestJson(buildImagePath(siteId, "gallery"), {
        body: payload,
        method: "PATCH"
      });
      if (destroyed) {
        return;
      }

      currentSite = {
        ...currentSite,
        galleryImages: response?.data?.images ?? readGallery(currentSite)
      };
      onSiteUpdated(currentSite);
      render();
      setStatus("Порядок галереи сохранён.");
    } catch (error) {
      showInlineError(error);
    } finally {
      endMutation(form);
    }
  }

  function openDeletePreviewDialog(invoker) {
    openDialog({
      confirmLabel: "Удалить главное изображение",
      description: `Удалить главное изображение сайта ${currentSite?.title ?? currentSite?.slug ?? siteId}.`,
      onConfirm: async () => {
        await apiClient.requestJson(buildImagePath(siteId, "preview"), {
          method: "DELETE"
        });
        if (destroyed) {
          return;
        }

        currentSite = {
          ...currentSite,
          previewImage: null,
          previewImageUrl: null
        };
        onSiteUpdated(currentSite);
        render();
        setStatus("Главное изображение удалено.");
      },
      title: "Удалить главное изображение"
    }, invoker);
  }

  function openDeleteGalleryDialog(image, invoker) {
    openDialog({
      confirmLabel: "Удалить изображение",
      description: `Удалить изображение галереи ${image.alt ?? image.assetId}.`,
      onConfirm: async () => {
        const response = await apiClient.requestJson(buildImagePath(siteId, "gallery-item", image.assetId), {
          method: "DELETE"
        });
        if (destroyed) {
          return;
        }

        currentSite = {
          ...currentSite,
          galleryImages: response?.data?.images ?? []
        };
        onSiteUpdated(currentSite);
        render();
        setStatus("Изображение галереи удалено.");
      },
      title: "Удалить изображение"
    }, invoker);
  }

  function openDialog(dialogOptions, invoker) {
    currentDialog?.destroy();
    currentDialog = createConfirmationDialog({
      ...dialogOptions,
      destructive: true,
      documentRef,
      onConfirm: async () => {
        try {
          await dialogOptions.onConfirm();
        } catch (error) {
          throw dialogError(error);
        }
      }
    });
    replaceContent(dialogHost, currentDialog.element);
    currentDialog.open(invoker);
  }

  function beginMutation(form) {
    if (mutationBusy) {
      return false;
    }

    mutationBusy = true;
    const button = form.querySelector("button");
    if (button !== null) {
      setBusy(button, true);
    }

    return true;
  }

  function endMutation(form) {
    mutationBusy = false;
    const button = form.querySelector("button");
    if (button !== null) {
      setBusy(button, false);
    }
  }

  function renderError(error) {
    replaceContent(content, createElement("p", {
      documentRef,
      className: "admin-state admin-state-error",
      text: safeMessage(error)
    }));
    renderStatusError(error);
  }

  function showInlineError(error) {
    renderStatusError(error);
  }

  function renderStatusError(error) {
    const children = [
      createElement("span", {
        documentRef,
        text: imageErrorMessage(error)
      })
    ];

    if (typeof error?.requestId === "string") {
      children.push(createRequestIdControl(error.requestId, { documentRef }));
    }

    replaceContent(statusRegion, ...children);
    onStatus(imageErrorMessage(error));
  }

  function renderBatchResult(result) {
    const succeeded = Array.isArray(result.succeeded) ? result.succeeded : [];
    const failed = Array.isArray(result.failed) ? result.failed : [];
    const statusText = failed.length > 0
      ? `Частично загружено: ${succeeded.length} успешно, ${failed.length} ${formatImageErrorCount(failed.length)}.`
      : `Выбранные изображения загружены: ${succeeded.length} успешно.`;
    const children = [
      createElement("span", {
        documentRef,
        text: statusText
      }),
      ...failed.map((item) => createElement("span", {
        documentRef,
        text: `${item.code}: ${item.message}`
      }))
    ];

    replaceContent(statusRegion, ...children);
    onStatus(statusText);
  }

  function setStatus(message) {
    statusRegion.textContent = message;
    onStatus(message);
  }

  function clearFileInputs() {
    for (const input of element.querySelectorAll("input")) {
      if (input.type === "file") {
        input.value = "";
        if (Array.isArray(input.files)) {
          input.files = [];
        }
      }
    }
  }

  function labeled(label, control) {
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

  return {
    destroy,
    element,
    load
  };
}

export function canManageImages(site, role) {
  if (typeof site !== "object" || site === null) {
    return false;
  }
  if ("active" in site && site.active !== true) {
    return false;
  }
  if ("deletedAt" in site && site.deletedAt !== null && site.deletedAt !== undefined) {
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

export function canCleanupDeletedSiteImages(site, role) {
  if (role !== "admin" || typeof site !== "object" || site === null) {
    return false;
  }

  return "deletedAt" in site && site.deletedAt !== null && site.deletedAt !== undefined;
}

export function buildGalleryReorderPayload(images) {
  return {
    items: images.map((image) => {
      const item = {
        assetId: validateUuid(image.assetId, "asset"),
        sortOrder: parseNonNegativeInteger(image.sortOrder, "sortOrder")
      };
      const alt = normalizeAlt(image.alt ?? "");

      if (alt.length > 0 || image.alt !== undefined) {
        item.alt = alt;
      }

      return item;
    })
  };
}

function sitePath(siteId) {
  return `/api/admin/sites/${validateUuid(siteId, "site")}`;
}

function readGallery(site) {
  return Array.isArray(site?.galleryImages) ? site.galleryImages : [];
}

function resolveImageUrl(value) {
  return resolveCatalogAssetUrl(value);
}

function legacyAssetMarker(resolution, documentRef) {
  return resolution?.source === "legacy"
    ? [
        createElement("p", {
          documentRef,
          className: "admin-image-origin",
          text: "Изображение из публичного каталога"
        })
      ]
    : [];
}

function parseNonNegativeInteger(value, fieldName) {
  const number = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be zero or a positive integer.`);
  }

  return number;
}

function readValueForAsset(form, name, assetId) {
  const fields = Array.from(form.querySelectorAll(`[name="${name}"]`));
  const field = fields.find((candidate) => candidate.getAttribute("data-asset-id") === assetId);

  return field?.value ?? "";
}

function safeMessage(error) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return "Не удалось выполнить действие.";
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

function imageErrorMessage(error) {
  return [
    typeof error?.code === "string" ? error.code : null,
    safeMessage(error)
  ].filter(Boolean).join(": ");
}

function dialogError(error) {
  const nextError = new Error(imageErrorMessage(error));
  nextError.requestId = typeof error?.requestId === "string" ? error.requestId : null;

  return nextError;
}
