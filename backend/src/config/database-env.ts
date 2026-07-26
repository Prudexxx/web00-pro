export interface RuntimeDatabaseEnv {
  DATABASE_URL: string;
}

export interface MigrationDatabaseEnv {
  DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
}

export interface TestDatabaseEnv {
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

type DatabaseEnvKey = keyof RuntimeDatabaseEnv | keyof MigrationDatabaseEnv | keyof TestDatabaseEnv;

const productionMarkers = ["supabase", "render", "production", "prod"];

export function parseRuntimeDatabaseEnv(input: NodeJS.ProcessEnv): RuntimeDatabaseEnv {
  const issues: string[] = [];
  const env = {
    DATABASE_URL: readRequiredUrl(input, "DATABASE_URL", issues)
  };

  if (env.DATABASE_URL !== "") {
    parseDatabaseUrlForIssues(env.DATABASE_URL, "DATABASE_URL", issues);
  }

  if (issues.length === 0) {
    collectRuntimeIssues(env, issues);
  }

  throwIfInvalid(issues);

  return env;
}

export function parseMigrationDatabaseEnv(input: NodeJS.ProcessEnv): MigrationDatabaseEnv {
  const issues: string[] = [];
  const env = {
    DATABASE_URL: readRequiredUrl(input, "DATABASE_URL", issues),
    SHADOW_DATABASE_URL: readRequiredUrl(input, "SHADOW_DATABASE_URL", issues)
  };

  if (env.DATABASE_URL !== "") {
    parseDatabaseUrlForIssues(env.DATABASE_URL, "DATABASE_URL", issues);
  }

  if (env.SHADOW_DATABASE_URL !== "") {
    parseDatabaseUrlForIssues(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL", issues);
  }

  if (issues.length === 0) {
    collectMigrationIssues(env, issues);
  }

  throwIfInvalid(issues);

  return env;
}

export function parseTestDatabaseEnv(input: NodeJS.ProcessEnv): TestDatabaseEnv {
  const issues: string[] = [];
  const env = {
    TEST_DATABASE_URL: readRequiredUrl(input, "TEST_DATABASE_URL", issues)
  };

  if (env.TEST_DATABASE_URL !== "") {
    parseDatabaseUrlForIssues(env.TEST_DATABASE_URL, "TEST_DATABASE_URL", issues);
  }

  if (issues.length === 0) {
    collectTestIssues(env, issues);
  }

  throwIfInvalid(issues);

  return env;
}

export function parseDatabaseUrl(
  value: string,
  variableName: DatabaseEnvKey
): DatabaseUrlParts {
  const issues: string[] = [];
  const parts = parseDatabaseUrlForIssues(value, variableName, issues);

  if (issues.length > 0 || parts === null) {
    throw new DatabaseEnvValidationError(issues);
  }

  return parts;
}

export function assertRuntimeDatabaseUrl(env: RuntimeDatabaseEnv): void {
  const issues: string[] = [];

  parseDatabaseUrlForIssues(env.DATABASE_URL, "DATABASE_URL", issues);

  if (issues.length === 0) {
    collectRuntimeIssues(env, issues);
  }

  throwIfInvalid(issues);
}

export function assertMigrationDatabaseUrl(
  env: MigrationDatabaseEnv,
  nodeEnv: string | undefined
): void {
  const issues: string[] = [];

  parseDatabaseUrlForIssues(env.DATABASE_URL, "DATABASE_URL", issues);
  parseDatabaseUrlForIssues(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL", issues);

  if (issues.length === 0) {
    collectMigrationIssues(env, issues);
  }

  if (nodeEnv === "production") {
    issues.push("DATABASE_URL must not run migrate dev when NODE_ENV is production.");
  }

  throwIfInvalid(issues);
}

export function assertTestDatabaseUrl(env: TestDatabaseEnv): void {
  const issues: string[] = [];

  parseDatabaseUrlForIssues(env.TEST_DATABASE_URL, "TEST_DATABASE_URL", issues);

  if (issues.length === 0) {
    collectTestIssues(env, issues);
  }

  throwIfInvalid(issues);
}

function readRequiredUrl(
  input: NodeJS.ProcessEnv,
  key: DatabaseEnvKey,
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
  variableName: DatabaseEnvKey,
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

function collectRuntimeIssues(env: RuntimeDatabaseEnv, issues: string[]): void {
  const database = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");

  if (isTestDatabaseName(database.database)) {
    issues.push("DATABASE_URL must not point to a test database.");
  }
}

function collectMigrationIssues(env: MigrationDatabaseEnv, issues: string[]): void {
  const database = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
  const shadow = parseDatabaseUrl(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL");

  if (sameDatabaseTarget(database, shadow)) {
    issues.push("DATABASE_URL and SHADOW_DATABASE_URL must be isolated.");
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
}

function collectTestIssues(env: TestDatabaseEnv, issues: string[]): void {
  const test = parseDatabaseUrl(env.TEST_DATABASE_URL, "TEST_DATABASE_URL");

  if (!isTestDatabaseName(test.database)) {
    issues.push("TEST_DATABASE_URL must point to a test database.");
  }

  if (hasProductionMarker(test)) {
    issues.push("TEST_DATABASE_URL must not point to a production-like database.");
  }
}

function throwIfInvalid(issues: readonly string[]): void {
  if (issues.length > 0) {
    throw new DatabaseEnvValidationError(issues);
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
