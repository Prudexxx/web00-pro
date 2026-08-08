import { AppError } from "../lib/errors.js";
import {
  assertConfiguredRuntimePrefix
} from "../modules/public-catalog/public-runtime-storage.js";
import {
  createPublicRuntimeTargetKey,
  type PublicRuntimeTargetConfig,
  type PublicRuntimeRole
} from "../modules/public-catalog/public-runtime-target.js";

export interface CloudRuRuntimeStorageConfig {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}

export type CloudRuRuntimeTargetEnvConfig =
  | { enabled: false }
  | {
      enabled: true;
      storage: CloudRuRuntimeStorageConfig;
      target: PublicRuntimeTargetConfig;
      targetKey: string;
    };

export interface CloudRuRuntimeEnvConfig {
  primary: CloudRuRuntimeTargetEnvConfig;
  shadow: CloudRuRuntimeTargetEnvConfig;
}

export function parseCloudRuRuntimeEnv(input: NodeJS.ProcessEnv): CloudRuRuntimeEnvConfig {
  const shadowEnabled = parseBoolean(input.WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED);
  const primaryEnabled = parseBoolean(input.WEB00_PUBLIC_RUNTIME_PRIMARY_ENABLED);
  if (!shadowEnabled && !primaryEnabled) {
    return {
      primary: { enabled: false },
      shadow: { enabled: false }
    };
  }

  const shared = readSharedRuntimeStorage(input);

  return {
    primary: parseRuntimeTarget({
      enabled: primaryEnabled,
      prefix: input.CLOUDRU_RUNTIME_PRIMARY_PREFIX ?? "runtime/production",
      role: "primary",
      shared
    }),
    shadow: parseRuntimeTarget({
      enabled: shadowEnabled,
      prefix: input.CLOUDRU_RUNTIME_SHADOW_PREFIX ?? input.CLOUDRU_RUNTIME_PREFIX ?? "",
      role: "shadow",
      shared
    })
  };
}

interface SharedRuntimeStorage {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}

function readSharedRuntimeStorage(input: NodeJS.ProcessEnv): SharedRuntimeStorage {
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

  return {
    accessKeyId,
    bucket,
    endpoint: safeEndpoint,
    publicBaseUrl: safePublicBaseUrl,
    region,
    secretAccessKey
  };
}

function parseRuntimeTarget(input: {
  enabled: boolean;
  prefix: string;
  role: PublicRuntimeRole;
  shared: SharedRuntimeStorage;
}): CloudRuRuntimeTargetEnvConfig {
  if (!input.enabled) {
    return { enabled: false };
  }

  let prefix: string;
  try {
    prefix = assertConfiguredRuntimePrefix(input.prefix, input.role);
  } catch {
    throw configurationInvalid();
  }

  const storage: CloudRuRuntimeStorageConfig = {
    accessKeyId: input.shared.accessKeyId,
    bucket: input.shared.bucket,
    endpoint: input.shared.endpoint,
    prefix,
    publicBaseUrl: input.shared.publicBaseUrl,
    region: input.shared.region,
    secretAccessKey: input.shared.secretAccessKey
  };
  const target: PublicRuntimeTargetConfig = {
    bucket: storage.bucket,
    catalogVersion: "v1",
    manifestPath: `${prefix}/catalog/v1/manifest.json`,
    prefix,
    provider: "cloudru",
    publicBaseUrl: storage.publicBaseUrl,
    role: input.role
  };

  return {
    enabled: true,
    storage,
    target,
    targetKey: createPublicRuntimeTargetKey(target)
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
