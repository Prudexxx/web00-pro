import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = join(process.cwd(), "src", "db", "prisma.ts");

describe("PrismaPg adapter module", () => {
  it("constructs Prisma Client only through PrismaPg adapter options", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('import { PrismaPg } from "@prisma/adapter-pg";');
    expect(source).toContain('import { PrismaClient } from "../generated/prisma/client.js";');
    expect(source).toContain("new PrismaPg({");
    expect(source).toContain("connectionString: options.databaseUrl");
    expect(source).toContain("max: options.poolMax ?? 5");
    expect(source).toContain("connectionTimeoutMillis:");
    expect(source).toContain("options.connectionTimeoutMillis ?? 10_000");
    expect(source).toContain("idleTimeoutMillis:");
    expect(source).toContain("options.idleTimeoutMillis ?? 10_000");
    expect(source).toContain("new PrismaClient({");
    expect(source).toContain("adapter,");
    expect(source).not.toContain("connection_limit");
    expect(source).not.toContain("connect_timeout");
  });

  it("declares the approved CreatePrismaClientOptions interface", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("export interface CreatePrismaClientOptions");
    expect(source).toContain("databaseUrl: string;");
    expect(source).toContain("logQueries?: boolean;");
    expect(source).toContain("poolMax?: number;");
    expect(source).toContain("connectionTimeoutMillis?: number;");
    expect(source).toContain("idleTimeoutMillis?: number;");
  });
});
