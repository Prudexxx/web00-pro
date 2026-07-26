import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
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
      "prisma:generate": "prisma generate --schema prisma/schema.prisma",
      seed: "tsx prisma/seed.ts",
      "seed:verify": "tsx scripts/verify-catalog-snapshot.ts",
      "seed:build-snapshot": "tsx scripts/build-catalog-snapshot.ts",
      typecheck: "npm run prisma:generate && tsc -p tsconfig.typecheck.json",
      "test:run": "npm run prisma:generate && vitest run",
      build: "npm run prisma:generate && tsc -p tsconfig.build.json",
      check:
        "npm run prisma:validate && npm run prisma:format:check && npm run prisma:generate && npm run typecheck && npm run test:run && npm run build"
    });
    expect(packageJson.scripts).not.toHaveProperty("postinstall");
  });

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
