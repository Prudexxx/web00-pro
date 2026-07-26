export interface StorageEnv {
  STORAGE_PUBLIC_BASE_URL: string;
  STORAGE_WORKER_ENABLED: boolean;
  STORAGE_WORKER_POLL_INTERVAL_SECONDS: number;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: "web00-catalog-images";
  SUPABASE_URL: string;
}

export interface StorageCredentials {
  serviceRoleKey: string;
  supabaseUrl: string;
}

export interface StorageConfig {
  bucket: "web00-catalog-images";
  credentials: StorageCredentials;
  publicBaseUrl: string;
  workerEnabled: boolean;
  workerPollIntervalSeconds: 60;
}

export interface StorageEnvValidationIssue {
  message: string;
  variable: keyof StorageEnv;
}

export class StorageEnvValidationError extends Error {
  public readonly issues: readonly StorageEnvValidationIssue[];

  public constructor(issues: readonly StorageEnvValidationIssue[]) {
    const variables = issues.map((issue) => issue.variable).join(", ");

    super(`Invalid storage environment configuration: ${variables}`);
    this.name = "StorageEnvValidationError";
    this.issues = issues;
  }
}

const canonicalBucket = "web00-catalog-images";
const canonicalPollIntervalSeconds = 60 as const;

export function parseStorageEnv(input: NodeJS.ProcessEnv): StorageEnv {
  const issues: StorageEnvValidationIssue[] = [];
  const publicBaseUrl = parseOrigin(input.STORAGE_PUBLIC_BASE_URL, {
    issues,
    variable: "STORAGE_PUBLIC_BASE_URL"
  });
  const workerEnabled = parseBoolean(input.STORAGE_WORKER_ENABLED, issues);
  const workerPollIntervalSeconds = parsePollInterval(
    input.STORAGE_WORKER_POLL_INTERVAL_SECONDS,
    issues
  );
  const serviceRoleKey = parseRequiredString(input.SUPABASE_SERVICE_ROLE_KEY, {
    issues,
    variable: "SUPABASE_SERVICE_ROLE_KEY"
  });
  const bucket = parseBucket(input.SUPABASE_STORAGE_BUCKET, issues);
  const supabaseUrl = parseOrigin(input.SUPABASE_URL, {
    issues,
    variable: "SUPABASE_URL"
  });

  if (issues.length > 0) {
    throw new StorageEnvValidationError(issues);
  }

  return {
    STORAGE_PUBLIC_BASE_URL: publicBaseUrl,
    STORAGE_WORKER_ENABLED: workerEnabled,
    STORAGE_WORKER_POLL_INTERVAL_SECONDS: workerPollIntervalSeconds,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_STORAGE_BUCKET: bucket,
    SUPABASE_URL: supabaseUrl
  };
}

export function toStorageConfig(env: StorageEnv): StorageConfig {
  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    credentials: {
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: env.SUPABASE_URL
    },
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
    workerEnabled: env.STORAGE_WORKER_ENABLED,
    workerPollIntervalSeconds: canonicalPollIntervalSeconds
  };
}

function parseOrigin(
  value: string | undefined,
  options: {
    issues: StorageEnvValidationIssue[];
    variable: "STORAGE_PUBLIC_BASE_URL" | "SUPABASE_URL";
  }
): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} is required.`
    });
    return "";
  }

  try {
    const url = new URL(trimmed);

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.origin !== trimmed
    ) {
      throw new Error("invalid origin");
    }

    return trimmed;
  } catch {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} must be an http or https origin without a path.`
    });
    return "";
  }
}

function parseBoolean(
  value: string | undefined,
  issues: StorageEnvValidationIssue[]
): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  issues.push({
    variable: "STORAGE_WORKER_ENABLED",
    message: "STORAGE_WORKER_ENABLED must be true or false."
  });
  return false;
}

function parsePollInterval(
  value: string | undefined,
  issues: StorageEnvValidationIssue[]
): 60 {
  if (value === String(canonicalPollIntervalSeconds)) {
    return canonicalPollIntervalSeconds;
  }

  issues.push({
    variable: "STORAGE_WORKER_POLL_INTERVAL_SECONDS",
    message: "STORAGE_WORKER_POLL_INTERVAL_SECONDS must be 60."
  });
  return canonicalPollIntervalSeconds;
}

function parseRequiredString(
  value: string | undefined,
  options: {
    issues: StorageEnvValidationIssue[];
    variable: "SUPABASE_SERVICE_ROLE_KEY";
  }
): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} is required.`
    });
  }

  return trimmed;
}

function parseBucket(
  value: string | undefined,
  issues: StorageEnvValidationIssue[]
): "web00-catalog-images" {
  if (value === canonicalBucket) {
    return canonicalBucket;
  }

  issues.push({
    variable: "SUPABASE_STORAGE_BUCKET",
    message: "SUPABASE_STORAGE_BUCKET must be web00-catalog-images."
  });
  return canonicalBucket;
}
