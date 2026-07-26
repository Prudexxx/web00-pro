import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ReadinessProbe, ReadinessService, ReadinessStatus } from "./readiness.types.js";

export interface CreateReadinessServiceOptions {
  probe: ReadinessProbe;
}

export function createReadinessService(
  options: CreateReadinessServiceOptions
): ReadinessService {
  return {
    async check(): Promise<ReadinessStatus> {
      try {
        await options.probe.check();
        return "ready";
      } catch {
        return "not_ready";
      }
    }
  };
}

export function createPrismaReadinessProbe(
  prisma: Pick<PrismaClient, "$queryRaw">
): ReadinessProbe {
  return {
    async check(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    }
  };
}
