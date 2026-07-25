import { Buffer } from "node:buffer";

export interface AuthEnv {
  ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_FINGERPRINT_SECRET: Buffer;
  AUTH_FINGERPRINT_SECRET_BASE64: string;
  AUTH_ORIGIN?: string;
  JWT_ACCESS_SECRET: Buffer;
  JWT_ACCESS_SECRET_BASE64: string;
  JWT_AUDIENCE: "web00-admin";
  JWT_ISSUER: "web00-backend";
  REFRESH_TOKEN_TTL_SECONDS: number;
  TRUST_PROXY_HOPS: number;
}

export interface AuthEnvValidationIssue {
  message: string;
  variable: keyof AuthEnv;
}

export class AuthEnvValidationError extends Error {
  public readonly issues: readonly AuthEnvValidationIssue[];

  public constructor(issues: readonly AuthEnvValidationIssue[]) {
    const variables = issues.map((issue) => issue.variable).join(", ");

    super(`Invalid auth environment configuration: ${variables}`);
    this.name = "AuthEnvValidationError";
    this.issues = issues;
  }
}

export function parseAuthEnv(input: NodeJS.ProcessEnv): AuthEnv {
  const issues: AuthEnvValidationIssue[] = [];
  const accessSecret = parseBase64Secret(input.JWT_ACCESS_SECRET_BASE64, {
    issues,
    variable: "JWT_ACCESS_SECRET_BASE64"
  });
  const fingerprintSecret = parseBase64Secret(
    input.AUTH_FINGERPRINT_SECRET_BASE64,
    {
      issues,
      variable: "AUTH_FINGERPRINT_SECRET_BASE64"
    }
  );
  const issuer = parseExactValue(input.JWT_ISSUER, {
    expected: "web00-backend",
    issues,
    variable: "JWT_ISSUER"
  });
  const audience = parseExactValue(input.JWT_AUDIENCE, {
    expected: "web00-admin",
    issues,
    variable: "JWT_AUDIENCE"
  });
  const accessTtl = parseInteger(input.ACCESS_TOKEN_TTL_SECONDS, {
    issues,
    max: 3600,
    min: 1,
    variable: "ACCESS_TOKEN_TTL_SECONDS"
  });
  const refreshTtl = parseInteger(input.REFRESH_TOKEN_TTL_SECONDS, {
    issues,
    max: 60 * 60 * 24 * 30,
    min: 60 * 60 * 24,
    variable: "REFRESH_TOKEN_TTL_SECONDS"
  });
  const trustProxyHops = parseInteger(input.TRUST_PROXY_HOPS, {
    issues,
    max: 3,
    min: 0,
    variable: "TRUST_PROXY_HOPS"
  });
  const authOrigin = parseAuthOrigin(input.AUTH_ORIGIN, issues);

  if (
    accessSecret.length >= 32 &&
    fingerprintSecret.length >= 32 &&
    accessSecret.equals(fingerprintSecret)
  ) {
    issues.push({
      variable: "AUTH_FINGERPRINT_SECRET_BASE64",
      message: "AUTH_FINGERPRINT_SECRET_BASE64 must differ from JWT_ACCESS_SECRET_BASE64."
    });
  }

  if (issues.length > 0) {
    throw new AuthEnvValidationError(issues);
  }

  return {
    ACCESS_TOKEN_TTL_SECONDS: accessTtl,
    AUTH_FINGERPRINT_SECRET: fingerprintSecret,
    AUTH_FINGERPRINT_SECRET_BASE64: input.AUTH_FINGERPRINT_SECRET_BASE64 ?? "",
    ...(authOrigin === undefined ? {} : { AUTH_ORIGIN: authOrigin }),
    JWT_ACCESS_SECRET: accessSecret,
    JWT_ACCESS_SECRET_BASE64: input.JWT_ACCESS_SECRET_BASE64 ?? "",
    JWT_AUDIENCE: audience,
    JWT_ISSUER: issuer,
    REFRESH_TOKEN_TTL_SECONDS: refreshTtl,
    TRUST_PROXY_HOPS: trustProxyHops
  };
}

interface Base64SecretOptions {
  issues: AuthEnvValidationIssue[];
  variable: "AUTH_FINGERPRINT_SECRET_BASE64" | "JWT_ACCESS_SECRET_BASE64";
}

function parseBase64Secret(
  value: string | undefined,
  options: Base64SecretOptions
): Buffer {
  if (value === undefined || value.trim() === "") {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} is required.`
    });
    return Buffer.alloc(0);
  }

  const trimmed = value.trim();
  let decoded: Buffer;

  try {
    decoded = Buffer.from(trimmed, "base64");
  } catch {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} must be valid base64.`
    });
    return Buffer.alloc(0);
  }

  if (decoded.length < 32) {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} must decode to at least 32 bytes.`
    });
  }

  return decoded;
}

interface ExactValueOptions<T extends "web00-admin" | "web00-backend"> {
  expected: T;
  issues: AuthEnvValidationIssue[];
  variable: T extends "web00-admin" ? "JWT_AUDIENCE" : "JWT_ISSUER";
}

function parseExactValue<T extends "web00-admin" | "web00-backend">(
  value: string | undefined,
  options: ExactValueOptions<T>
): T {
  if (value === options.expected) {
    return options.expected;
  }

  options.issues.push({
    variable: options.variable,
    message: `${options.variable} must be ${options.expected}.`
  });

  return options.expected;
}

interface IntegerOptions {
  issues: AuthEnvValidationIssue[];
  max: number;
  min: number;
  variable:
    | "ACCESS_TOKEN_TTL_SECONDS"
    | "REFRESH_TOKEN_TTL_SECONDS"
    | "TRUST_PROXY_HOPS";
}

function parseInteger(value: string | undefined, options: IntegerOptions): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} must be an integer.`
    });
    return options.min;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    options.issues.push({
      variable: options.variable,
      message: `${options.variable} is outside the approved range.`
    });
  }

  return parsed;
}

function parseAuthOrigin(
  value: string | undefined,
  issues: AuthEnvValidationIssue[]
): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);

    if (url.origin !== trimmed || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new Error("invalid origin");
    }
  } catch {
    issues.push({
      variable: "AUTH_ORIGIN",
      message: "AUTH_ORIGIN must be an http or https origin without a path."
    });
  }

  return trimmed;
}
