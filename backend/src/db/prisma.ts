import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  logQueries?: boolean;
  poolMax?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  if (options.databaseUrl.trim() === "") {
    throw new Error("databaseUrl is required.");
  }

  const adapter = new PrismaPg({
    connectionString: options.databaseUrl,
    max: options.poolMax ?? 5,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? 10_000,
    idleTimeoutMillis:
      options.idleTimeoutMillis ?? 10_000
  });

  return new PrismaClient({
    adapter,
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"]
  });
}
