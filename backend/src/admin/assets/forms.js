export const SITE_LIMITS = Object.freeze({
  deliveryLabel: 80,
  demoMode: 40,
  features: {
    item: 160,
    max: 30
  },
  fullDescription: 5000,
  legacyTitle: 160,
  previewType: 40,
  priceLabel: 80,
  shortDescription: 500,
  slug: 120,
  tags: {
    item: 80,
    max: 30
  },
  title: 160,
  url: 2048
});

const PROTECTED_SITE_FIELDS = new Set([
  "active",
  "createdAt",
  "deletedAt",
  "galleryImages",
  "id",
  "previewImageUrl",
  "publishedAt",
  "status",
  "updatedAt",
  "views"
]);

const OPTIONAL_TEXT_FIELDS = {
  deliveryLabel: SITE_LIMITS.deliveryLabel,
  demoMode: SITE_LIMITS.demoMode,
  fullDescription: SITE_LIMITS.fullDescription,
  legacyTitle: SITE_LIMITS.legacyTitle,
  previewType: SITE_LIMITS.previewType,
  priceLabel: SITE_LIMITS.priceLabel
};

const URL_FIELDS = [
  "demoLocalUrl",
  "demoUrl",
  "externalDemoUrl",
  "originalDemoUrl",
  "siteUrl"
];

export class FormValidationError extends Error {
  constructor(details) {
    super("Invalid form input.");
    this.name = "FormValidationError";
    this.code = "FORM_VALIDATION_ERROR";
    this.details = details;
  }
}

export function normalizeSlug(value) {
  const slug = requireText(value, "slug", SITE_LIMITS.slug).toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw validationError("slug", "Slug must use lowercase letters, numbers, and hyphens.");
  }

  return slug;
}

export function serializeNullableText(value, maxLength, fieldName = "text") {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength) {
    throw validationError(fieldName, `Must be at most ${maxLength} characters.`);
  }

  return text;
}

export function serializeOptionalUrl(value, fieldName = "url") {
  const text = serializeNullableText(value, SITE_LIMITS.url, fieldName);

  if (text === null) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw validationError(fieldName, "Must be a valid http or https URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError(fieldName, "Must be a valid http or https URL.");
  }

  return parsed.href;
}

export function serializePositiveInteger(value, fieldName) {
  const text = serializeNullableText(value, 20, fieldName);

  if (text === null) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    throw validationError(fieldName, "Must be a positive integer.");
  }

  const number = Number.parseInt(text, 10);

  if (number <= 0) {
    throw validationError(fieldName, "Must be a positive integer.");
  }

  return number;
}

export function serializeNonNegativeInteger(value, fieldName) {
  const text = serializeNullableText(value, 20, fieldName);

  if (text === null) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    throw validationError(fieldName, "Must be zero or a positive integer.");
  }

  return Number.parseInt(text, 10);
}

export function serializeStringList(items, options) {
  const values = Array.isArray(items)
    ? items
    : String(items ?? "").split(/\r?\n/);
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);

  if (normalized.length > options.maxItems) {
    throw validationError(options.fieldName, `Must contain at most ${options.maxItems} items.`);
  }

  for (const item of normalized) {
    if (item.length > options.maxLength) {
      throw validationError(options.fieldName, `Each item must be at most ${options.maxLength} characters.`);
    }
  }

  return normalized;
}

export function mapValidationDetails(details) {
  const mapped = {};

  for (const detail of Array.isArray(details) ? details : []) {
    const field = typeof detail?.path === "string" && detail.path.length > 0
      ? detail.path
      : "_form";
    const message = typeof detail?.message === "string" && detail.message.length > 0
      ? detail.message
      : "Invalid value.";

    mapped[field] ??= [];
    mapped[field].push(message);
  }

  return mapped;
}

export function buildCreateSitePayload(formState) {
  const source = toRecord(formState);
  const payload = {
    slug: normalizeSlug(source.slug),
    title: requireText(source.title, "title", SITE_LIMITS.title),
    categoryId: requireText(source.categoryId, "categoryId", 80),
    shortDescription: requireText(source.shortDescription, "shortDescription", SITE_LIMITS.shortDescription)
  };

  addSharedOptionalFields(payload, source);

  return dropProtectedFields(payload);
}

export function buildUpdateSitePayload(formState, role) {
  const source = toRecord(formState);
  const payload = {};

  if (source.categoryId !== undefined) {
    payload.categoryId = requireText(source.categoryId, "categoryId", 80);
  }
  if (source.shortDescription !== undefined) {
    payload.shortDescription = requireText(source.shortDescription, "shortDescription", SITE_LIMITS.shortDescription);
  }
  if (source.title !== undefined) {
    payload.title = requireText(source.title, "title", SITE_LIMITS.title);
  }
  if (role === "admin" && source.slug !== undefined) {
    payload.slug = normalizeSlug(source.slug);
  }
  if (role === "admin" && source.featured !== undefined) {
    payload.featured = source.featured === true || source.featured === "true" || source.featured === "on";
  }

  addSharedOptionalFields(payload, source);

  return dropProtectedFields(payload);
}

function addSharedOptionalFields(payload, source) {
  for (const [field, maxLength] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    if (source[field] !== undefined) {
      payload[field] = serializeNullableText(source[field], maxLength, field);
    }
  }

  for (const field of URL_FIELDS) {
    if (source[field] !== undefined) {
      payload[field] = serializeOptionalUrl(source[field], field);
    }
  }

  if (source.developmentDays !== undefined) {
    payload.developmentDays = serializePositiveInteger(source.developmentDays, "developmentDays");
  }
  if (source.priceAmountCents !== undefined) {
    payload.priceAmountCents = serializePositiveInteger(source.priceAmountCents, "priceAmountCents");
  }
  if (source.sortOrder !== undefined) {
    const sortOrder = serializeNonNegativeInteger(source.sortOrder, "sortOrder");
    if (sortOrder !== null) {
      payload.sortOrder = sortOrder;
    }
  }
  if (source.features !== undefined) {
    payload.features = serializeStringList(source.features, {
      fieldName: "features",
      maxItems: SITE_LIMITS.features.max,
      maxLength: SITE_LIMITS.features.item
    });
  }
  if (source.tags !== undefined) {
    payload.tags = serializeStringList(source.tags, {
      fieldName: "tags",
      maxItems: SITE_LIMITS.tags.max,
      maxLength: SITE_LIMITS.tags.item
    });
  }
}

function requireText(value, fieldName, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    throw validationError(fieldName, `${toTitle(fieldName)} is required.`);
  }
  if (text.length > maxLength) {
    throw validationError(fieldName, `Must be at most ${maxLength} characters.`);
  }

  return text;
}

function dropProtectedFields(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => (
      !PROTECTED_SITE_FIELDS.has(key) && value !== undefined
    ))
  );
}

function validationError(path, message) {
  return new FormValidationError([{ message, path }]);
}

function toRecord(input) {
  return typeof input === "object" && input !== null ? input : {};
}

function toTitle(fieldName) {
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
