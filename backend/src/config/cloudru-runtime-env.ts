import { AppError } from "../lib/errors.js";
import { normalizeRuntimePrefix } from "../modules/public-catalog/public-runtime-storage.js";

export interface CloudRuRuntimeStorageConfig {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}

export type CloudRuRuntimeEnvConfig =
  | { enabled: false }
  | {
      enabled: true;
      storage: CloudRuRuntimeStorageConfig;
    };

export function parseCloudRuRuntimeEnv(input: NodeJS.ProcessEnv): CloudRuRuntimeEnvConfig {
  const enabled = parseBoolean(input.WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED);
  if (!enabled) {
    return { enabled: false };
  }

  const endpoint = readRequired(input.CLOUDRU_S3_ENDPOINT);
  const region = readRequired(input.CLOUDRU_S3_REGION);
  const bucket = readRequired(input.CLOUDRU_S3_BUCKET);
  const accessKeyId = readRequired(input.CLOUDRU_S3_ACCESS_KEY_ID);
  const secretAccessKey = readRequired(input.CLOUDRU_S3_SECRET_ACCESS_KEY);
  const publicBaseUrl = readRequired(input.CLOUDRU_PUBLIC_BASE_URL);

  if (
    endpoint === "" ||
    region === "" ||
    bucket === "" ||
    accessKeyId === "" ||
    secretAccessKey === "" ||
    publicBaseUrl === ""
  ) {
    throw configurationInvalid();
  }

  const safeEndpoint = sanitizeUrl(endpoint, { requireHttps: true });
  const safePublicBaseUrl = sanitizeUrl(publicBaseUrl, { requireHttps: true });
  if (safeEndpoint === null || safePublicBaseUrl === null || !isSafeBucket(bucket)) {
    throw configurationInvalid();
  }

  let prefix: string;
  try {
    prefix = normalizeRuntimePrefix(input.CLOUDRU_RUNTIME_PREFIX ?? "");
  } catch {
    throw configurationInvalid();
  }
  if (prefix !== "canary/shadow") {
    throw configurationInvalid();
  }

  return {
    enabled: true,
    storage: {
      accessKeyId,
      bucket,
      endpoint: safeEndpoint,
      prefix,
      publicBaseUrl: safePublicBaseUrl,
      region,
      secretAccessKey
    }
  };
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("en-US");
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readRequired(value: string | undefined): string {
  return String(value ?? "").trim();
}

function sanitizeUrl(value: string, options: { requireHttps: boolean }): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (options.requireHttps && parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") return null;
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.href.replace(/\/+$/, "");
}

function isSafeBucket(value: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) && !value.includes("..");
}

function configurationInvalid(): AppError {
  return new AppError({
    code: "CONFIGURATION_ERROR",
    message: "Cloud.ru public runtime configuration is invalid.",
    statusCode: 503
  });
}
