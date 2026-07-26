import { describe, expect, it } from "vitest";
import {
  DatabaseEnvValidationError,
  assertMigrationDatabaseUrl,
  assertRuntimeDatabaseUrl,
  assertTestDatabaseUrl,
  parseMigrationDatabaseEnv,
  parseDatabaseUrl,
  parseRuntimeDatabaseEnv,
  parseTestDatabaseEnv
} from "../src/config/database-env.js";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_dev?schema=public",
  SHADOW_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_shadow?schema=public",
  TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_test?schema=public"
};

describe("database environment contract", () => {
  it("parses runtime DATABASE_URL without requiring shadow or test URLs", () => {
    const input = envWithThrowingReads(
      { DATABASE_URL: validEnv.DATABASE_URL },
      ["SHADOW_DATABASE_URL", "TEST_DATABASE_URL"]
    );

    expect(parseRuntimeDatabaseEnv(input)).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL
    });
    expect(() =>
      assertRuntimeDatabaseUrl({ DATABASE_URL: validEnv.DATABASE_URL })
    ).not.toThrow();

    expect(parseDatabaseUrl(validEnv.DATABASE_URL, "DATABASE_URL")).toMatchObject({
      database: "web00_backend_dev",
      host: "127.0.0.1",
      port: "5433",
      protocol: "postgresql:",
      schema: "public"
    });
  });

  it("parses migration DATABASE_URL and SHADOW_DATABASE_URL without requiring test URLs", () => {
    const input = envWithThrowingReads(
      {
        DATABASE_URL: validEnv.DATABASE_URL,
        SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
      },
      ["TEST_DATABASE_URL"]
    );

    const env = parseMigrationDatabaseEnv(input);

    expect(env).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL,
      SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
    });
    expect(() => assertMigrationDatabaseUrl(env, "development")).not.toThrow();
  });

  it("parses TEST_DATABASE_URL without requiring runtime or shadow URLs", () => {
    const input = envWithThrowingReads(
      { TEST_DATABASE_URL: validEnv.TEST_DATABASE_URL },
      ["DATABASE_URL", "SHADOW_DATABASE_URL"]
    );

    const env = parseTestDatabaseEnv(input);

    expect(env).toEqual({
      TEST_DATABASE_URL: validEnv.TEST_DATABASE_URL
    });
    expect(() => assertTestDatabaseUrl(env)).not.toThrow();
  });

  it("rejects missing, invalid, and non-PostgreSQL URLs without exposing raw values", () => {
    expect(() =>
      parseRuntimeDatabaseEnv({
        DATABASE_URL: "mysql://user:secret@prod.example.com:3306/web00_backend_dev"
      })
    ).toThrow(DatabaseEnvValidationError);

    try {
      parseRuntimeDatabaseEnv({
        DATABASE_URL: "mysql://user:secret@prod.example.com:3306/web00_backend_dev"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseEnvValidationError);
      expect(String(error)).toContain("DATABASE_URL");
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(JSON.stringify(error)).not.toContain("prod.example.com");
    }
  });

  it("enforces distinct migration and shadow database targets", () => {
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          DATABASE_URL: validEnv.DATABASE_URL,
          SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
        },
        "development"
      )
    ).not.toThrow();
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          DATABASE_URL: validEnv.DATABASE_URL,
          SHADOW_DATABASE_URL: validEnv.DATABASE_URL
        },
        "development"
      )
    ).toThrow(DatabaseEnvValidationError);
  });

  it("rejects test database names for runtime URLs", () => {
    expect(() =>
      parseRuntimeDatabaseEnv({
        DATABASE_URL: validEnv.TEST_DATABASE_URL
      })
    ).toThrow(DatabaseEnvValidationError);
  });

  it("requires integration tests to use a marked test database", () => {
    expect(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: validEnv.TEST_DATABASE_URL
      })
    ).not.toThrow();
    expect(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/web00_backend_dev?schema=public"
      })
    ).toThrow(DatabaseEnvValidationError);
  });

  it("blocks production and test targets for migrate dev", () => {
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          DATABASE_URL: validEnv.DATABASE_URL,
          SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
        },
        "development"
      )
    ).not.toThrow();
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          DATABASE_URL: validEnv.DATABASE_URL,
          SHADOW_DATABASE_URL: validEnv.SHADOW_DATABASE_URL
        },
        "production"
      )
    ).toThrow(DatabaseEnvValidationError);
    expect(() =>
      assertMigrationDatabaseUrl(
        {
          DATABASE_URL: validEnv.TEST_DATABASE_URL,
          SHADOW_DATABASE_URL: validEnv.DATABASE_URL
        },
        "development"
      )
    ).toThrow(DatabaseEnvValidationError);
  });
});

function envWithThrowingReads(
  values: Record<string, string>,
  throwingKeys: readonly string[]
): NodeJS.ProcessEnv {
  const input: Record<string, string | undefined> = { ...values };

  for (const key of throwingKeys) {
    Object.defineProperty(input, key, {
      get() {
        throw new Error(`${key} was read`);
      }
    });
  }

  return input as NodeJS.ProcessEnv;
}
