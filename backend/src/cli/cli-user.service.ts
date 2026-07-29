import type { CliOutput, CliUserRole } from "./cli.types.js";
import type {
  CliUserRepository,
  SafeCliUserRecord
} from "./cli-user.repository.js";
import { normalizeEmail } from "../modules/auth/auth.schemas.js";

export interface BootstrapFirstAdminInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
}

export interface CreateCliUserInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
  role?: CliUserRole;
}

export interface SetUserPasswordInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
}

export interface CliUserService {
  bootstrapFirstAdmin(input: BootstrapFirstAdminInput): Promise<CliOutput>;
  createUser(input: CreateCliUserInput): Promise<CliOutput>;
  setPassword(input: SetUserPasswordInput): Promise<CliOutput>;
}

export function createCliUserService(options: {
  repository: CliUserRepository;
}): CliUserService {
  const repository = options.repository;

  return {
    async bootstrapFirstAdmin(input) {
      const user = await repository.bootstrapFirstAdmin({
        email: normalizeEmail(input.email),
        now: input.now,
        passwordHash: input.passwordHash,
        requestId: input.requestId
      });

      return {
        code: "USER_BOOTSTRAPPED",
        message: "Admin user was bootstrapped.",
        requestId: input.requestId,
        user: toCliOutputUser(user)
      };
    },
    async createUser(input) {
      const user = await repository.createUser({
        email: normalizeEmail(input.email),
        now: input.now,
        passwordHash: input.passwordHash,
        requestId: input.requestId,
        role: input.role ?? "editor"
      });

      return {
        code: "USER_CREATED",
        message: "User was created.",
        requestId: input.requestId,
        user: toCliOutputUser(user)
      };
    },
    async setPassword(input) {
      const result = await repository.setPassword({
        email: normalizeEmail(input.email),
        now: input.now,
        passwordHash: input.passwordHash,
        requestId: input.requestId
      });

      return {
        code: "USER_PASSWORD_SET",
        message: "Password was updated and active sessions were revoked.",
        requestId: input.requestId,
        sessionsRevoked: result.sessionsRevoked,
        user: toCliOutputUser(result.user)
      };
    }
  };
}

function toCliOutputUser(user: SafeCliUserRecord): NonNullable<CliOutput["user"]> {
  return {
    active: user.active,
    email: user.email,
    id: user.id,
    role: user.role
  };
}
