import type { PrismaClient } from "../generated/prisma/client.js";
import type { AuthRole } from "../modules/auth/auth.types.js";

export interface InteractiveTerminal {
  promptVisible(label: string): Promise<string>;
  promptSecret(label: string): Promise<string>;
  confirmExact(label: string, expected: string): Promise<boolean>;
  writeSafe(message: string): void;
  close(): Promise<void>;
}

export interface CliOutput {
  code: string;
  message: string;
  requestId?: string;
  sessionsRevoked?: number;
  user?: {
    active: boolean;
    email: string;
    id: string;
    role: AuthRole;
  };
}

export interface CliRuntime {
  clock: () => Date;
  createPrisma: (databaseUrl: string) => PrismaClient;
  randomUUID: () => string;
  terminal: InteractiveTerminal;
}

export interface PasswordPolicy {
  validate(password: string): PasswordPolicyResult;
}

export type PasswordPolicyResult =
  | { ok: true }
  | {
      code:
        | "PASSWORD_TOO_SHORT"
        | "PASSWORD_TOO_LONG"
        | "PASSWORD_NOT_LOGIN_COMPATIBLE";
      message: string;
      ok: false;
    };

export type CliUserRole = "admin" | "editor";
