export interface DatabaseEnv {
  DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
  TEST_DATABASE_URL: string;
}

export interface DatabaseUrlParts {
  database: string;
  host: string;
  href: string;
  port: string;
  protocol: "postgresql:" | "postgres:";
  schema: string;
}

export class DatabaseEnvValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid database environment: ${issues.join("; ")}`);
    this.name = "DatabaseEnvValidationError";
    this.issues = issues;
  }
}

const databaseEnvKeys = ["DATABASE_URL", "SHADOW_DATABASE_URL", "TEST_DATABASE_URL"] as const;
const productionMarkers = ["supabase", "render", "production", "prod"];

export function parseDatabaseEnv(input: NodeJS.ProcessEnv): DatabaseEnv {
  const issues: string[] = [];
  const env = {
    DATABASE_URL: readRequiredUrl(input, "DATABASE_URL", issues),
    SHADOW_DATABASE_URL: readRequiredUrl(input, "SHADOW_DATABASE_URL", issues),
    TEST_DATABASE_URL: readRequiredUrl(input, "TEST_DATABASE_URL", issues)
  };

  for (const key of databaseEnvKeys) {
    if (env[key] !== "") {
      parseDatabaseUrlForIssues(env[key], key, issues);
    }
  }

  if (issues.length === 0) {
    collectIsolationIssues(env, issues);
  }

  if (issues.length > 0) {
    throw new DatabaseEnvValidationError(issues);
  }

  return env;
}

export function parseDatabaseUrl(value: string, variableName: keyof DatabaseEnv): DatabaseUrlParts {
  const issues: string[] = [];
  const parts = parseDatabaseUrlForIssues(value, variableName, issues);

  if (issues.length > 0 || parts === null) {
    throw new DatabaseEnvValidationError(issues);
  }

  return parts;
}

export function assertDatabaseIsolation(env: DatabaseEnv): void {
  const issues: string[] = [];

  for (const key of databaseEnvKeys) {
    parseDatabaseUrlForIssues(env[key], key, issues);
  }

  if (issues.length === 0) {
    collectIsolationIssues(env, issues);
  }

  if (issues.length > 0) {
    throw new DatabaseEnvValidationError(issues);
  }
}

export function assertTestDatabaseUrl(env: DatabaseEnv): void {
  assertDatabaseIsolation(env);

  const parts = parseDatabaseUrl(env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  const issues: string[] = [];

  if (!isTestDatabaseName(parts.database)) {
    issues.push("TEST_DATABASE_URL must point to a test database.");
  }

  if (hasProductionMarker(parts)) {
    issues.push("TEST_DATABASE_URL must not point to a production-like database.");
  }

  if (issues.length > 0) {
    throw new DatabaseEnvValidationError(issues);
  }
}

export function assertMigrationDatabaseUrl(
  env: DatabaseEnv,
  nodeEnv: string | undefined
): void {
  assertDatabaseIsolation(env);

  const database = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
  const shadow = parseDatabaseUrl(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL");
  const issues: string[] = [];

  if (nodeEnv === "production") {
    issues.push("DATABASE_URL must not run migrate dev when NODE_ENV is production.");
  }

  if (isTestDatabaseName(database.database)) {
    issues.push("DATABASE_URL must not point to a test database for migrate dev.");
  }

  if (!isShadowDatabaseName(shadow.database)) {
    issues.push("SHADOW_DATABASE_URL must point to a shadow database.");
  }

  if (hasProductionMarker(database)) {
    issues.push("DATABASE_URL must not point to a production-like database.");
  }

  if (issues.length > 0) {
    throw new DatabaseEnvValidationError(issues);
  }
}

function readRequiredUrl(
  input: NodeJS.ProcessEnv,
  key: keyof DatabaseEnv,
  issues: string[]
): string {
  const value = input[key];

  if (value === undefined || value.trim() === "") {
    issues.push(`${key} is required.`);
    return "";
  }

  return value;
}

function parseDatabaseUrlForIssues(
  value: string,
  variableName: keyof DatabaseEnv,
  issues: string[]
): DatabaseUrlParts | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    issues.push(`${variableName} must be a valid PostgreSQL URL.`);
    return null;
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    issues.push(`${variableName} must use postgresql or postgres protocol.`);
    return null;
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (database === "") {
    issues.push(`${variableName} must include a database name.`);
    return null;
  }

  const schema = url.searchParams.get("schema") ?? "public";
  const port = url.port === "" ? "5432" : url.port;

  return {
    database,
    host: url.hostname,
    href: `${url.protocol}//${url.hostname}:${port}/${database}?schema=${schema}`,
    port,
    protocol: url.protocol,
    schema
  };
}

function collectIsolationIssues(env: DatabaseEnv, issues: string[]): void {
  const database = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
  const shadow = parseDatabaseUrl(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL");
  const test = parseDatabaseUrl(env.TEST_DATABASE_URL, "TEST_DATABASE_URL");

  if (sameDatabaseTarget(database, shadow)) {
    issues.push("DATABASE_URL and SHADOW_DATABASE_URL must be isolated.");
  }

  if (sameDatabaseTarget(database, test)) {
    issues.push("DATABASE_URL and TEST_DATABASE_URL must be isolated.");
  }

  if (sameDatabaseTarget(shadow, test)) {
    issues.push("SHADOW_DATABASE_URL and TEST_DATABASE_URL must be isolated.");
  }

  if (isTestDatabaseName(database.database)) {
    issues.push("DATABASE_URL must not point to a test database.");
  }

  if (!isShadowDatabaseName(shadow.database)) {
    issues.push("SHADOW_DATABASE_URL must point to a shadow database.");
  }

  if (!isTestDatabaseName(test.database)) {
    issues.push("TEST_DATABASE_URL must point to a test database.");
  }
}

function sameDatabaseTarget(left: DatabaseUrlParts, right: DatabaseUrlParts): boolean {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

function isTestDatabaseName(database: string): boolean {
  return database.endsWith("_test") || database.includes("_test_");
}

function isShadowDatabaseName(database: string): boolean {
  return database.endsWith("_shadow") || database.includes("_shadow_");
}

function hasProductionMarker(parts: DatabaseUrlParts): boolean {
  const target = `${parts.host} ${parts.database}`.toLowerCase();

  return productionMarkers.some((marker) => target.includes(marker));
}
