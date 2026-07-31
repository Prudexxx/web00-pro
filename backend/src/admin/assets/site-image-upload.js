import { createRandomUuid } from "./random-id.js";

export const IMAGE_UPLOAD_LIMITS = Object.freeze({
  batchBytes: 30 * 1024 * 1024,
  batchFiles: 10,
  fileBytes: 5 * 1024 * 1024,
  galleryImages: 20,
  imageAlt: 160
});

export const supportedImageTypes = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPORTED_IMAGE_TYPE_SET = new Set(supportedImageTypes);

export function buildImagePath(siteId, kind, assetId) {
  const safeSiteId = validateUuid(siteId, "site");

  if (kind === "preview") {
    return `/api/admin/sites/${safeSiteId}/images/preview`;
  }
  if (kind === "gallery") {
    return `/api/admin/sites/${safeSiteId}/images/gallery`;
  }
  if (kind === "gallery-batch") {
    return `/api/admin/sites/${safeSiteId}/images/gallery/batch`;
  }
  if (kind === "gallery-item") {
    return `/api/admin/sites/${safeSiteId}/images/gallery/${encodeURIComponent(validateUuid(assetId, "asset"))}`;
  }

  throw new Error("Invalid image route.");
}

export function buildPreviewFormData({ alt, clientFileId, file }) {
  const formData = new FormData();

  formData.append("image", file);
  formData.append("clientFileId", validateUuid(clientFileId, "clientFile"));
  formData.append("alt", normalizeAlt(alt));

  return formData;
}

export function buildGalleryBatchFormData({ alt, clientFileIds, files }) {
  const formData = new FormData();
  const normalizedAlt = normalizeAlt(alt);
  const metadata = files.map((_, index) => ({
    alt: normalizedAlt,
    clientFileId: validateUuid(clientFileIds[index], "clientFile")
  }));

  formData.append("metadata", JSON.stringify(metadata));
  for (const file of files) {
    formData.append("images", file);
  }

  return formData;
}

export function createClientFileId(uuidFactory = createRandomUuid) {
  return validateUuid(uuidFactory(), "clientFile");
}

export function readSingleFile(input, fieldName) {
  const file = input?.files?.[0];

  if (file === undefined) {
    throw new Error(`${fieldName} image is required.`);
  }

  return file;
}

export function validateImageFile(file) {
  if (typeof file !== "object" || file === null) {
    throw new Error("Выберите изображение.");
  }
  if (!SUPPORTED_IMAGE_TYPE_SET.has(file.type)) {
    throw new Error("Поддерживаются только JPEG, PNG, WEBP или AVIF.");
  }
  if (file.size > IMAGE_UPLOAD_LIMITS.fileBytes) {
    throw new Error("Файл должен быть не больше 5 MB.");
  }
}

export function validateBatch(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Выберите изображения.");
  }
  if (files.length > IMAGE_UPLOAD_LIMITS.batchFiles) {
    throw new Error("Gallery batch должен содержать не больше 10 файлов.");
  }
  for (const file of files) {
    validateImageFile(file);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);

  if (total > IMAGE_UPLOAD_LIMITS.batchBytes) {
    throw new Error("Gallery batch должен быть не больше 30 MB.");
  }
}

export function assertGalleryCapacity(gallery, selectedCount) {
  if (gallery.length + selectedCount > IMAGE_UPLOAD_LIMITS.galleryImages) {
    throw new Error("Gallery должна содержать не больше 20 изображений.");
  }
}

export function normalizeAlt(value) {
  const text = String(value ?? "").trim();

  if (text.length > IMAGE_UPLOAD_LIMITS.imageAlt) {
    throw new Error("Alt должен быть не длиннее 160 символов.");
  }

  return text;
}

export function normalizeGalleryBatchResult(result, context = {}) {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray(result.succeeded) ||
    !Array.isArray(result.failed)
  ) {
    throw new Error("Сервер вернул некорректный ответ.");
  }

  const succeeded = result.succeeded;
  const failed = result.failed;
  const clientFileIds = Array.isArray(context.clientFileIds) ? context.clientFileIds : [];
  const files = Array.isArray(context.files) ? context.files : [];
  const normalizedSucceeded = succeeded.map((item) => ({
    clientFileId: typeof item?.clientFileId === "string" ? item.clientFileId : clientFileIds[item?.index],
    file: files[Number.isInteger(item?.index) ? item.index : clientFileIds.indexOf(item?.clientFileId)],
    image: item?.image ?? null,
    index: Number.isInteger(item?.index) ? item.index : clientFileIds.indexOf(item?.clientFileId),
    replayed: item?.replayed === true
  })).filter((item) => typeof item.clientFileId === "string" && item.index >= 0);
  const normalizedFailed = failed.map((item) => {
    const index = Number.isInteger(item?.index) ? item.index : clientFileIds.indexOf(item?.clientFileId);

    return {
      clientFileId: typeof item?.clientFileId === "string" ? item.clientFileId : clientFileIds[index],
      code: typeof item?.code === "string" ? item.code : "UPLOAD_FAILED",
      file: files[index],
      index,
      message: typeof item?.message === "string" ? item.message : "Не удалось загрузить изображение."
    };
  }).filter((item) => typeof item.clientFileId === "string" && item.index >= 0);

  return {
    counts: {
      failed: normalizedFailed.length,
      succeeded: normalizedSucceeded.length,
      total: files.length > 0 ? files.length : normalizedFailed.length + normalizedSucceeded.length
    },
    failed: normalizedFailed,
    succeeded: normalizedSucceeded
  };
}

export function selectFailedGalleryFiles(result) {
  return (Array.isArray(result?.failed) ? result.failed : [])
    .filter((item) => item?.file !== undefined)
    .map((item) => ({
      clientFileId: item.clientFileId,
      file: item.file,
      index: item.index
    }));
}

export function selectedNames(files) {
  return Array.from(files ?? []).map((file) => file.name).join(", ");
}

export { createRandomUuid };

export function validateUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} id.`);
  }

  return value;
}
