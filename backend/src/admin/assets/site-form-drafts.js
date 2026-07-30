export const SITE_FORM_DRAFT_KEY_PREFIX = "web00_admin_site_form_draft_v1";

const SECRET_FIELD_PATTERN = /token|authorization|cookie|password|secret|jwt/i;

export function resolveSiteFormDraftStorage(storage = undefined, globalRef = globalThis) {
  if (storage !== undefined) {
    return isStorageLike(storage) ? storage : null;
  }

  try {
    return isStorageLike(globalRef?.localStorage) ? globalRef.localStorage : null;
  } catch {
    return null;
  }
}

export function buildSiteFormDraftKey({ mode, siteId }) {
  const scope = mode === "edit" && typeof siteId === "string" && siteId.length > 0
    ? `edit:${siteId}`
    : "create:new";

  return `${SITE_FORM_DRAFT_KEY_PREFIX}:${scope}`;
}

export function readSiteFormDraft(storage, key) {
  if (!isStorageLike(storage)) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (typeof raw !== "string" || raw.length === 0) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isValidDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSiteFormDraft(storage, key, draft) {
  if (!isStorageLike(storage)) {
    return;
  }

  const fields = sanitizeFields(draft?.fields);
  const payload = {
    fields,
    routeType: draft?.routeType === "edit" ? "edit" : "create",
    siteId: typeof draft?.siteId === "string" ? draft.siteId : null,
    temporaryClientId: typeof draft?.temporaryClientId === "string" ? draft.temporaryClientId : null,
    updatedAt: typeof draft?.updatedAt === "string" ? draft.updatedAt : new Date().toISOString()
  };

  storage.setItem(key, JSON.stringify(payload));
}

export function removeSiteFormDraft(storage, key) {
  if (isStorageLike(storage)) {
    storage.removeItem(key);
  }
}

function sanitizeFields(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => (
        !SECRET_FIELD_PATTERN.test(key) &&
        (typeof value === "string" || typeof value === "boolean" || value === null)
      ))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 5000) : value])
  );
}

function isValidDraft(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    (input.routeType === "create" || input.routeType === "edit") &&
    typeof input.updatedAt === "string" &&
    typeof input.fields === "object" &&
    input.fields !== null &&
    !Array.isArray(input.fields)
  );
}

function isStorageLike(storage) {
  return (
    storage !== null &&
    storage !== undefined &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
  );
}
