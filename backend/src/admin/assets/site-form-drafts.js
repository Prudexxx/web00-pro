import { isStableClientRequestId } from "./random-id.js";

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
    return false;
  }

  const fields = sanitizeFields(draft?.fields);
  const mode = draft?.mode === "edit" || draft?.routeType === "edit" ? "edit" : "create";
  const payload = {
    clientRequestId: sanitizeClientRequestId(draft?.clientRequestId),
    fields,
    hadImageSelection: draft?.hadImageSelection === true,
    mode,
    routeType: mode,
    siteId: typeof draft?.siteId === "string" ? draft.siteId : null,
    temporaryClientId: typeof draft?.temporaryClientId === "string" ? draft.temporaryClientId : null,
    updatedAt: typeof draft?.updatedAt === "string" ? draft.updatedAt : new Date().toISOString()
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function removeSiteFormDraft(storage, key) {
  if (!isStorageLike(storage)) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
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
    (input.routeType === "create" || input.routeType === "edit" || input.mode === "create" || input.mode === "edit") &&
    typeof input.updatedAt === "string" &&
    typeof input.fields === "object" &&
    input.fields !== null &&
    !Array.isArray(input.fields)
  );
}

function sanitizeClientRequestId(value) {
  return isStableClientRequestId(value) ? value : null;
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
