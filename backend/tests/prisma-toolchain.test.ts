import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function runNpmScriptWithoutDatabaseUrls(script: string): ReturnType<typeof spawnSync> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DOTENV_CONFIG_PATH: join(backendRoot, ".env.prisma-generate-contract-missing"),
    NODE_ENV: "production"
  };

  delete env.DATABASE_URL;
  delete env.SHADOW_DATABASE_URL;
  delete env.TEST_DATABASE_URL;

  const npmExecPath = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  ].find((candidate): candidate is string => candidate !== undefined && existsSync(candidate));
  const command = npmExecPath === undefined ? npmCommand : process.execPath;
  const args = npmExecPath === undefined ? ["run", script] : [npmExecPath, "run", script];

  return spawnSync(command, args, {
    cwd: backendRoot,
    encoding: "utf8",
    env,
    shell: npmExecPath === undefined && process.platform === "win32",
    timeout: 120_000
  });
}

describe("Prisma toolchain contract", () => {
  it("declares only approved B2 direct dependencies and scripts", () => {
    const packageJson = readJsonFile<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    }>(join(backendRoot, "package.json"));

    expect(packageJson.dependencies).toMatchObject({
      "@prisma/client": expect.stringMatching(/^(\^)?7\./),
      "@prisma/adapter-pg": expect.stringMatching(/^(\^)?7\./),
      argon2: "0.45.1",
      cookie: "2.0.1",
      dotenv: expect.stringMatching(/^(\^)?17\./),
      express: "^5.2.1",
      "express-rate-limit": "8.6.0",
      helmet: "8.3.0",
      jose: "6.2.3",
      pg: expect.stringMatching(/^\^8\./),
      zod: "^4.4.3"
    });
    expect(packageJson.devDependencies).toMatchObject({
      "@types/pg": expect.stringMatching(/^\^8\./),
      prisma: expect.stringMatching(/^(\^)?7\./)
    });
    expect(packageJson.dependencies).not.toHaveProperty("bcrypt");
    expect(packageJson.dependencies).not.toHaveProperty("cookie-parser");
    expect(packageJson.dependencies).not.toHaveProperty("express-session");
    expect(packageJson.dependencies).not.toHaveProperty("jsonwebtoken");
    expect(packageJson).not.toHaveProperty("overrides");
    expect(packageJson.scripts).toMatchObject({
      "db:migrate:dev": "prisma migrate dev --schema prisma/schema.prisma",
      "db:migrate:deploy": "prisma migrate deploy --schema prisma/schema.prisma",
      "db:migrate:status": "prisma migrate status --schema prisma/schema.prisma",
      "prisma:validate": "prisma validate --schema prisma/schema.prisma",
      "prisma:format": "prisma format --schema prisma/schema.prisma",
      "prisma:format:check": "tsx scripts/check-prisma-format.ts",
      "prisma:generate": "prisma generate --config prisma.generate.config.ts",
      seed: "tsx prisma/seed.ts",
      "seed:verify": "tsx scripts/verify-catalog-snapshot.ts",
      "seed:build-snapshot": "tsx scripts/build-catalog-snapshot.ts",
      typecheck: "npm run prisma:generate && tsc -p tsconfig.typecheck.json",
      "test:run": "npm run prisma:generate && vitest run",
      build:
        "npm run prisma:generate && tsc -p tsconfig.build.json && node scripts/copy-admin-assets.mjs",
      check:
        "npm run prisma:validate && npm run prisma:format:check && npm run prisma:generate && npm run typecheck && npm run test:run && npm run build"
    });
    expect(packageJson.scripts).not.toHaveProperty("postinstall");
  });

  it("separates Prisma generate from strict migration config", () => {
    const packageJson = readJsonFile<{
      scripts?: Record<string, string>;
    }>(join(backendRoot, "package.json"));
    const generationConfig = readFileSync(join(backendRoot, "prisma.generate.config.ts"), "utf8");
    const migrationConfig = readFileSync(join(backendRoot, "prisma.config.ts"), "utf8");

    expect(packageJson.scripts?.["prisma:generate"]).toBe(
      "prisma generate --config prisma.generate.config.ts"
    );
    expect(generationConfig).toContain('import { defineConfig } from "prisma/config";');
    expect(generationConfig).toContain('schema: "prisma/schema.prisma"');
    expect(generationConfig).not.toContain("datasource");
    expect(generationConfig).not.toContain("DATABASE_URL");
    expect(generationConfig).not.toContain("SHADOW_DATABASE_URL");
    expect(generationConfig).not.toContain("dotenv/config");
    expect(generationConfig).not.toMatch(/postgres(?:ql)?:\/\//);
    expect(generationConfig).not.toContain("password");
    expect(generationConfig).not.toContain("sb_secret_");

    expect(migrationConfig).toContain('import "dotenv/config";');
    expect(migrationConfig).toContain('url: env("DATABASE_URL")');
    expect(migrationConfig).toContain('shadowDatabaseUrl: env("SHADOW_DATABASE_URL")');

    for (const scriptName of [
      "prisma:validate",
      "db:migrate:dev",
      "db:migrate:deploy",
      "db:migrate:status",
      "seed"
    ]) {
      expect(packageJson.scripts?.[scriptName]).not.toContain("prisma.generate.config.ts");
    }
  });

  it("generates Prisma client without database URLs in a Render-shaped build environment", () => {
    const result = runNpmScriptWithoutDatabaseUrls("prisma:generate");
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(output).not.toContain("DATABASE_URL=");
    expect(output).not.toContain("SHADOW_DATABASE_URL=");
    expect(output).not.toContain("TEST_DATABASE_URL=");
    expect(result.status, output).toBe(0);
    expect(existsSync(join(backendRoot, "src", "generated", "prisma", "client.ts"))).toBe(true);
  }, 120_000);

  it("keeps generated Prisma output and local env files out of Git", () => {
    const gitignore = readFileSync(join(backendRoot, ".gitignore"), "utf8");

    expect(gitignore).toContain("src/generated/prisma/");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
  });

  it("documents safe local database placeholders without pool query parameters", () => {
    const envExample = readFileSync(join(backendRoot, ".env.example"), "utf8");

    expect(envExample).toContain("DATABASE_URL=");
    expect(envExample).toContain("SHADOW_DATABASE_URL=");
    expect(envExample).toContain("TEST_DATABASE_URL=");
    expect(envExample).toContain("web00_backend_dev");
    expect(envExample).toContain("web00_backend_shadow");
    expect(envExample).toContain("web00_backend_test");
    expect(envExample).not.toContain("connection_limit");
    expect(envExample).not.toContain("connect_timeout");
  });

  it("documents production hardening environment ownership safely", () => {
    const envExample = readFileSync(join(backendRoot, ".env.example"), "utf8");

    expect(envExample).toContain("# Runtime server");
    expect(envExample).toContain("# Migration tooling");
    expect(envExample).toContain("# Test only");
    expect(envExample).toContain("# Authentication");
    expect(envExample).toContain("# Public CORS");
    expect(envExample).toContain("# Storage");
    expect(envExample).toContain("# Cleanup worker");
    expect(envExample).toContain("PUBLIC_CORS_ORIGINS=");
    expect(envExample).toContain("AUTH_ORIGIN=");
    expect(envExample.indexOf("# Runtime server")).toBeLessThan(
      envExample.indexOf("# Migration tooling")
    );
    expect(envExample.indexOf("# Migration tooling")).toBeLessThan(
      envExample.indexOf("# Test only")
    );
    expect(envExample).not.toContain("real-service-role-key");
    expect(envExample).not.toContain("production-password");
  });

  it("documents the Render Free operational contract", () => {
    const readme = readFileSync(join(backendRoot, "README.md"), "utf8");

    expect(readme).toContain("Render Free");
    expect(readme).not.toContain(
      "`DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL` live only in local `backend/.env`, Render variables, or CI secrets."
    );
    expect(readme).toContain("Render web service variables must include only runtime values.");
    expect(readme).toContain("Root Directory: `backend`");
    expect(readme).toContain("Build Command: `npm ci && npm run prisma:generate && npm run build`");
    expect(readme).toContain("Start Command: `npm run start`");
    expect(readme).toContain("Health Check Path: `/api/ready`");
    expect(readme).toContain("& $PortableNpm run db:migrate:deploy");
    expect(readme).toContain("& $PortableNpm run seed");
    expect(readme).toContain("& $PortableNpm run storage:bootstrap");
    expect(readme).toContain("& $PortableNpm run admin:bootstrap");
    expect(readme).toContain("trusted machine");
  });

  it("uses a non-mutating Prisma format check helper", () => {
    const script = readFileSync(join(backendRoot, "scripts", "check-prisma-format.ts"), "utf8");

    expect(script).toContain("mkdtemp");
    expect(script).toContain('spawnSync("prisma", ["format"');
    expect(script).toContain("schema.prisma");
  });
});
