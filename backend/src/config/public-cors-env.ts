import type { NodeEnvironment } from "./env.js";

export interface PublicCorsEnv {
  PUBLIC_CORS_ORIGINS: readonly string[];
}

export interface PublicCorsConfig {
  allowedMethods: readonly ["GET", "HEAD", "OPTIONS"];
  allowedOrigins: ReadonlySet<string>;
  maxOrigins: 10;
}

export interface PublicCorsEnvParseOptions {
  nodeEnv: NodeEnvironment;
}

export interface PublicCorsEnvValidationIssue {
  message: string;
  variable: "PUBLIC_CORS_ORIGINS";
}

export class PublicCorsEnvValidationError extends Error {
  public readonly issues: readonly PublicCorsEnvValidationIssue[];

  public constructor(issues: readonly PublicCorsEnvValidationIssue[]) {
    const variables = issues.map((issue) => issue.variable).join(", ");

    super(`Invalid public CORS environment configuration: ${variables}`);
    this.name = "PublicCorsEnvValidationError";
    this.issues = issues;
  }
}

const maxOrigins = 10;
const allowedMethods = ["GET", "HEAD", "OPTIONS"] as const;

export function parsePublicCorsEnv(
  input: NodeJS.ProcessEnv,
  options: PublicCorsEnvParseOptions
): PublicCorsEnv {
  const issues: PublicCorsEnvValidationIssue[] = [];
  const rawValue = input.PUBLIC_CORS_ORIGINS ?? "";
  const normalizedOrigins: string[] = [];
  const seenOrigins = new Set<string>();

  for (const entry of rawValue.split(",")) {
    const trimmed = entry.trim();

    if (trimmed === "") {
      continue;
    }

    const normalized = parsePublicCorsOrigin(trimmed, options, issues);

    if (normalized !== undefined && !seenOrigins.has(normalized)) {
      seenOrigins.add(normalized);
      normalizedOrigins.push(normalized);
    }
  }

  if (options.nodeEnv === "production" && normalizedOrigins.length === 0) {
    issues.push({
      variable: "PUBLIC_CORS_ORIGINS",
      message: "PUBLIC_CORS_ORIGINS requires at least one origin in production."
    });
  }

  if (normalizedOrigins.length > maxOrigins) {
    issues.push({
      variable: "PUBLIC_CORS_ORIGINS",
      message: "PUBLIC_CORS_ORIGINS allows at most 10 origins."
    });
  }

  if (issues.length > 0) {
    throw new PublicCorsEnvValidationError(issues);
  }

  return {
    PUBLIC_CORS_ORIGINS: normalizedOrigins
  };
}

export function toPublicCorsConfig(env: PublicCorsEnv): PublicCorsConfig {
  return {
    allowedMethods,
    allowedOrigins: new Set(env.PUBLIC_CORS_ORIGINS),
    maxOrigins
  };
}

function parsePublicCorsOrigin(
  value: string,
  options: PublicCorsEnvParseOptions,
  issues: PublicCorsEnvValidationIssue[]
): string | undefined {
  try {
    if (value.includes("*")) {
      throw new Error("invalid origin");
    }

    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid origin");
    }

    if (url.username !== "" || url.password !== "") {
      throw new Error("invalid origin");
    }

    if (url.search !== "" || url.hash !== "") {
      throw new Error("invalid origin");
    }

    if (!hasOnlyRootPath(value, url)) {
      throw new Error("invalid origin");
    }

    if (url.pathname !== "" && url.pathname !== "/") {
      throw new Error("invalid origin");
    }

    if (options.nodeEnv === "production" && url.protocol !== "https:") {
      throw new Error("invalid origin");
    }

    if (url.protocol === "http:" && !isLocalhost(url.hostname)) {
      throw new Error("invalid origin");
    }

    return url.origin;
  } catch {
    issues.push({
      variable: "PUBLIC_CORS_ORIGINS",
      message: "PUBLIC_CORS_ORIGINS must contain exact approved origins."
    });
    return undefined;
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function hasOnlyRootPath(value: string, url: URL): boolean {
  const schemePrefix = `${url.protocol}//`;

  if (!value.toLowerCase().startsWith(schemePrefix)) {
    return false;
  }

  const afterAuthority = value.slice(schemePrefix.length);
  const pathStart = afterAuthority.search(/[/?#]/);

  if (pathStart === -1) {
    return true;
  }

  return afterAuthority.slice(pathStart) === "/";
}
