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
  priceRubles: 20,
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
export const DB_INT_MAX = 2147483647;

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
  fullDescription: SITE_LIMITS.fullDescription,
  legacyTitle: SITE_LIMITS.legacyTitle,
  previewType: SITE_LIMITS.previewType,
  priceLabel: SITE_LIMITS.priceLabel
};

const SIMPLE_DEMO_URL_FIELDS = new Set(["demoUrl", "externalDemoUrl", "originalDemoUrl"]);
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

const CYRILLIC_TRANSLITERATION = Object.freeze({
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
});

export function generateSiteSlug(value) {
  const transliterated = String(value ?? "")
    .trim()
    .toLowerCase()
    .split("")
    .map((letter) => CYRILLIC_TRANSLITERATION[letter] ?? letter)
    .join("");
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SITE_LIMITS.slug)
    .replace(/-+$/g, "");

  return slug.length > 0 ? slug : "site";
}

export function appendSlugTimestamp(slug, now = new Date()) {
  const safeSlug = generateSiteSlug(slug);
  const timestamp = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join("");
  const suffix = `-${timestamp}`;
  const base = safeSlug
    .slice(0, Math.max(1, SITE_LIMITS.slug - suffix.length))
    .replace(/-+$/g, "");

  return `${base}${suffix}`;
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

export function parseRublesToCents(value, fieldName = "priceRubles") {
  const text = serializeNullableText(value, SITE_LIMITS.priceRubles, fieldName);

  if (text === null) {
    return null;
  }

  const compact = text.replace(/\s+/g, "");

  if (compact.startsWith("-")) {
    throw validationError(fieldName, "Введите цену в рублях без минуса.");
  }
  if (/^\d+[,.]\d{3,}$/.test(compact)) {
    throw validationError(fieldName, "Цена может содержать не больше двух знаков после запятой.");
  }
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(compact)) {
    throw validationError(fieldName, "Введите цену в рублях: например 15000 или 15000,50.");
  }

  const [rubles, fraction = ""] = compact.replace(",", ".").split(".");
  const cents = (BigInt(rubles) * 100n) + BigInt((fraction + "00").slice(0, 2));

  if (cents <= 0n) {
    throw validationError(fieldName, "Введите цену больше нуля.");
  }
  if (cents > BigInt(DB_INT_MAX)) {
    throw validationError(fieldName, "Цена слишком большая для сохранения.");
  }

  return Number(cents);
}

export function formatCentsToRubles(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const cents = Number(value);

  if (!Number.isInteger(cents) || cents <= 0) {
    return "";
  }

  const rubles = Math.floor(cents / 100);
  const kopecks = cents % 100;

  return kopecks === 0
    ? String(rubles)
    : `${rubles},${String(kopecks).padStart(2, "0")}`;
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
  if (number > DB_INT_MAX) {
    throw validationError(fieldName, `Must be at most ${DB_INT_MAX}.`);
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

  const number = Number.parseInt(text, 10);

  if (number > DB_INT_MAX) {
    throw validationError(fieldName, `Must be at most ${DB_INT_MAX}.`);
  }

  return number;
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
  if (source.demoMode !== undefined) {
    payload.demoMode = serializeDemoMode(source.demoMode);
  }
  if (source.demoUrlSimple !== undefined) {
    const demoMode = payload.demoMode ?? serializeDemoMode(source.demoMode ?? "none");

    if (demoMode === "external-iframe") {
      const demoUrl = serializeOptionalUrl(source.demoUrlSimple, "demoUrlSimple");

      payload.demoUrl = demoUrl;
      payload.externalDemoUrl = demoUrl;
      payload.originalDemoUrl = demoUrl;
    } else {
      payload.demoUrl = null;
      payload.externalDemoUrl = null;
      payload.originalDemoUrl = null;
    }
  }

  for (const [field, maxLength] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    if (source[field] !== undefined) {
      payload[field] = serializeNullableText(source[field], maxLength, field);
    }
  }

  for (const field of URL_FIELDS) {
    if (source[field] !== undefined) {
      if (
        source.demoUrlSimple !== undefined &&
        SIMPLE_DEMO_URL_FIELDS.has(field) &&
        serializeNullableText(source[field], SITE_LIMITS.url, field) === null
      ) {
        continue;
      }
      payload[field] = serializeOptionalUrl(source[field], field);
    }
  }

  if (source.developmentDays !== undefined) {
    payload.developmentDays = serializePositiveInteger(source.developmentDays, "developmentDays");
  }
  if (source.priceAmountCents !== undefined) {
    payload.priceAmountCents = serializePositiveInteger(source.priceAmountCents, "priceAmountCents");
  }
  if (source.priceRubles !== undefined) {
    payload.priceAmountCents = parseRublesToCents(source.priceRubles, "priceRubles");
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

function serializeDemoMode(value) {
  const text = serializeNullableText(value, SITE_LIMITS.demoMode, "demoMode");

  if (text === null) {
    return null;
  }
  if (text === "none" || text === "external-iframe") {
    return text;
  }

  throw validationError("demoMode", "Выберите допустимый режим демо.");
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
