export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STABLE_CLIENT_REQUEST_ID_PATTERN = /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRandomUuid(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.randomUUID === "function") {
    const value = cryptoRef.randomUUID.call(cryptoRef);

    if (typeof value === "string" && UUID_V4_PATTERN.test(value)) {
      return value.toLowerCase();
    }
  }

  if (typeof cryptoRef?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoRef.getRandomValues.call(cryptoRef, bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return formatUuid(bytes);
  }

  throw browserCryptoUnavailable();
}

export function createStableClientRequestId(cryptoRef = globalThis.crypto) {
  return `req_${createRandomUuid(cryptoRef)}`;
}

export function isStableClientRequestId(value) {
  return typeof value === "string" && STABLE_CLIENT_REQUEST_ID_PATTERN.test(value);
}

function formatUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}

function browserCryptoUnavailable() {
  const error = new Error("Браузер не может создать безопасный идентификатор операции.");
  error.code = "BROWSER_CRYPTO_UNAVAILABLE";
  error.status = 0;

  return error;
}
