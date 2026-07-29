import { createHash, createHmac } from "node:crypto";
import type { AppLogger } from "../../lib/logger.js";
import type { AuthAuditService, SafeAuditInput } from "./auth.types.js";

export interface CreateAuthAuditServiceOptions {
  fingerprintSecret: Uint8Array;
}

export function createAuthAuditService(
  options: CreateAuthAuditServiceOptions
): AuthAuditService {
  return {
    createSafeAuditInput: (input) => ({ ...input }),
    logFailedLogin: (input) =>
      logFailedLogin({
        ...input,
        fingerprintSecret: options.fingerprintSecret
      })
  };
}

export function createFingerprint(
  value: string | undefined,
  secret: Uint8Array
): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function logFailedLogin(input: {
  email: string;
  environment: string;
  fingerprintSecret: Uint8Array;
  logger: AppLogger;
  requestId: string;
  service: string;
  time: Date;
}): void {
  input.logger.log({
    emailHash: createHash("sha256")
      .update(input.email.trim().toLowerCase(), "utf8")
      .digest("hex"),
    environment: input.environment,
    event: "auth.login.failed",
    level: "warn",
    requestId: input.requestId,
    service: input.service,
    time: input.time.toISOString()
  });
}

export function toAuditJson(input: SafeAuditInput): {
  action: SafeAuditInput["action"];
  actorUserId: string | null;
  entityId: string | null;
  ipHash: string | null;
  requestId: string;
  userAgentHash: string | null;
} {
  return {
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    entityId: input.entityId ?? null,
    ipHash: input.ipHash ?? null,
    requestId: input.requestId,
    userAgentHash: input.userAgentHash ?? null
  };
}
