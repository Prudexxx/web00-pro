import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseRuntimeDatabaseEnv } from "../config/database-env.js";
import { createPrismaClient } from "../db/prisma.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PasswordHasher } from "../modules/auth/auth.types.js";
import { createArgon2PasswordHasher } from "../modules/auth/password.service.js";
import { CliError, toCliErrorOutput } from "./cli-errors.js";
import type { CliUserRole, InteractiveTerminal } from "./cli.types.js";
import {
  createPrismaCliUserRepository,
  type CliUserRepository
} from "./cli-user.repository.js";
import { createCliUserService } from "./cli-user.service.js";
import { writeCliOutput } from "./cli-output.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import { createPasswordPolicy, promptConfirmedPassword } from "./password-prompt.js";

export interface UserCreateCommandOptions {
  clock?: () => Date;
  hasher?: PasswordHasher;
  processEnv?: NodeJS.ProcessEnv;
  randomUUID?: () => string;
  repository?: CliUserRepository;
  terminal?: InteractiveTerminal;
}

export async function runUserCreateCommand(
  options: UserCreateCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  const requestId = `cli:${(options.randomUUID ?? randomUUID)()}`;

  try {
    const email = await terminal.promptVisible("User email: ");
    const role = parseRole(await terminal.promptVisible("Role [editor/admin, default editor]: "));
    const password = await promptConfirmedPassword(terminal, createPasswordPolicy());
    const confirmation = role === "admin" ? "CREATE ADMIN" : "CREATE USER";
    const confirmed = await terminal.confirmExact(
      `Type ${confirmation} to continue: `,
      confirmation
    );

    if (!confirmed) {
      throw new CliError("CLI_CONFIRMATION_REQUIRED");
    }

    const passwordHash = await (options.hasher ?? createArgon2PasswordHasher()).hash(password);
    const { repository, disconnect } = createRepository(options);

    try {
      const service = createCliUserService({ repository });
      const output = await service.createUser({
        email,
        now: (options.clock ?? (() => new Date()))(),
        passwordHash,
        requestId,
        role
      });

      writeCliOutput(terminal, output);
      return 0;
    } finally {
      await disconnect();
    }
  } catch (error) {
    writeCliOutput(terminal, toCliErrorOutput(error, requestId));
    return error instanceof CliError ? error.exitCode : 1;
  } finally {
    await terminal.close();
  }
}

function parseRole(input: string): CliUserRole {
  const value = input.trim().toLowerCase();

  if (value === "") {
    return "editor";
  }

  if (value === "admin" || value === "editor") {
    return value;
  }

  throw new CliError("CLI_CONFIRMATION_REQUIRED");
}

function createRepository(options: UserCreateCommandOptions): {
  disconnect: () => Promise<void>;
  repository: CliUserRepository;
} {
  if (options.repository !== undefined) {
    return {
      disconnect: async () => undefined,
      repository: options.repository
    };
  }

  const env = parseRuntimeDatabaseEnv(options.processEnv ?? process.env);
  const prisma = createPrismaClient({
    databaseUrl: env.DATABASE_URL
  });

  return {
    disconnect: () => prisma.$disconnect(),
    repository: createPrismaCliUserRepository({ prisma: prisma as PrismaClient })
  };
}

if (isDirectRun()) {
  void runUserCreateCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
