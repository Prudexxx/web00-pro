import { z } from "zod";

export type NodeEnvironment = "development" | "test" | "production";
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface AppEnv {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  LOG_LEVEL: LogLevel;
  SERVICE_NAME: string;
}

export interface EnvironmentValidationIssue {
  variable: keyof AppEnv;
  message: string;
}

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly EnvironmentValidationIssue[];

  public constructor(issues: readonly EnvironmentValidationIssue[]) {
    const variables = issues.map((issue) => issue.variable).join(", ");

    super(`Invalid environment configuration: ${variables}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const logLevelSchema = z.enum(["silent", "error", "warn", "info", "debug"]);
const serviceNameSchema = z.string().trim().min(1);
const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => Number(value))
  .pipe(z.number().int().min(1).max(65_535));

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const issues: EnvironmentValidationIssue[] = [];
  const nodeEnv = parseNodeEnvironment(input.NODE_ENV, issues);
  const logLevel = parseLogLevel(input.LOG_LEVEL, nodeEnv, issues);
  const serviceName = parseServiceName(input.SERVICE_NAME, issues);
  const port = parsePort(input.PORT, nodeEnv, issues);

  if (issues.length > 0) {
    throw new EnvironmentValidationError(issues);
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    LOG_LEVEL: logLevel,
    SERVICE_NAME: serviceName
  };
}

function parseNodeEnvironment(
  value: string | undefined,
  issues: EnvironmentValidationIssue[]
): NodeEnvironment {
  if (value === undefined) {
    return "development";
  }

  const result = nodeEnvironmentSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  issues.push({
    variable: "NODE_ENV",
    message: "NODE_ENV must be development, test, or production."
  });

  return "development";
}

function parseLogLevel(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
  issues: EnvironmentValidationIssue[]
): LogLevel {
  if (value === undefined) {
    return nodeEnv === "test" ? "silent" : "info";
  }

  const result = logLevelSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  issues.push({
    variable: "LOG_LEVEL",
    message: "LOG_LEVEL must be silent, error, warn, info, or debug."
  });

  return nodeEnv === "test" ? "silent" : "info";
}

function parseServiceName(
  value: string | undefined,
  issues: EnvironmentValidationIssue[]
): string {
  if (value === undefined) {
    return "web00-backend";
  }

  const result = serviceNameSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  issues.push({
    variable: "SERVICE_NAME",
    message: "SERVICE_NAME must be a non-empty string."
  });

  return "web00-backend";
}

function parsePort(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
  issues: EnvironmentValidationIssue[]
): number {
  if (value === undefined) {
    if (nodeEnv === "production") {
      issues.push({
        variable: "PORT",
        message: "PORT is required in production."
      });
    }

    return 3000;
  }

  const result = portSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  issues.push({
    variable: "PORT",
    message: "PORT must be an integer between 1 and 65535."
  });

  return 3000;
}
