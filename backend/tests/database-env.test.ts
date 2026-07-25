import { describe, expect, it } from "vitest";
import {
  DatabaseEnvValidationError,
  assertDatabaseIsolation,
  assertMigrationDatabaseUrl,
  assertTestDatabaseUrl,
  parseDatabaseEnv,
  parseDatabaseUrl
} from "../src/config/database-env.js";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_dev?schema=public",
  SHADOW_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_shadow?schema=public",
  TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_test?schema=public"
};

describe("database environment contract", () => {
  it("parses the three required local PostgreSQL URLs", () => {
    expect(parseDatabaseEnv(validEnv)).toEqual(validEnv);

    expect(parseDatabaseUrl(validEnv.DATABASE_URL, "DATABASE_URL")).toMatchObject({
      database: "web00_backend_dev",
      host: "127.0.0.1",
      port: "5433",
      protocol: "postgresql:",
      schema: "public"
    });
  });

  it("rejects missing, invalid, and non-PostgreSQL URLs without exposing raw values", () => {
    expect(() =>
      parseDatabaseEnv({
        DATABASE_URL: "mysql://user:secret@prod.example.com:3306/web00_backend_dev",
        SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
      })
    ).toThrow(DatabaseEnvValidationError);

    try {
      parseDatabaseEnv({
        DATABASE_URL: "mysql://user:secret@prod.example.com:3306/web00_backend_dev",
        SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseEnvValidationError);
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).toContain("TEST_DATABASE_URL");
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain("prod.example.com");
    }
  });

  it("enforces distinct development, shadow, and test database targets", () => {
    expect(() => assertDatabaseIsolation(validEnv)).not.toThrow();
    expect(() =>
      assertDatabaseIsolation({
        ...validEnv,
        SHADOW_DATABASE_URL: validEnv.DATABASE_URL
      })
    ).toThrow(DatabaseEnvValidationError);
  });

  it("requires integration tests to use a marked test database", () => {
    expect(() => assertTestDatabaseUrl(validEnv)).not.toThrow();
    expect(() =>
      assertTestDatabaseUrl({
        ...validEnv,
        TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_dev?schema=public"
      })
    ).toThrow(DatabaseEnvValidationError);
  });

  it("blocks production and test targets for migrate dev", () => {
    expect(() => assertMigrationDatabaseUrl(validEnv, "development")).not.toThrow();
    expect(() => assertMigrationDatabaseUrl(validEnv, "production")).toThrow(DatabaseEnvValidationError);
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          ...validEnv,
          DATABASE_URL: validEnv.TEST_DATABASE_URL
        },
        "development"
      )
    ).toThrow(DatabaseEnvValidationError);
  });
});
