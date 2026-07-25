import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseDatabaseEnv } from "../config/database-env.js";
import { createPrismaClient } from "../db/prisma.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PasswordHasher } from "../modules/auth/auth.types.js";
import { createArgon2PasswordHasher } from "../modules/auth/password.service.js";
import { CliError, toCliErrorOutput } from "./cli-errors.js";
import type { InteractiveTerminal } from "./cli.types.js";
import {
  createPrismaCliUserRepository,
  type CliUserRepository
} from "./cli-user.repository.js";
import { createCliUserService } from "./cli-user.service.js";
import { writeCliOutput } from "./cli-output.js";
import { createInteractiveTerminal } from "./interactive-terminal.js";
import { createPasswordPolicy, promptConfirmedPassword } from "./password-prompt.js";

export interface UserSetPasswordCommandOptions {
  clock?: () => Date;
  hasher?: PasswordHasher;
  processEnv?: NodeJS.ProcessEnv;
  randomUUID?: () => string;
  repository?: CliUserRepository;
  terminal?: InteractiveTerminal;
}

export async function runUserSetPasswordCommand(
  options: UserSetPasswordCommandOptions = {}
): Promise<number> {
  const terminal = options.terminal ?? createInteractiveTerminal();
  const requestId = `cli:${(options.randomUUID ?? randomUUID)()}`;

  try {
    const email = await terminal.promptVisible("Target user email: ");
    const password = await promptConfirmedPassword(
      terminal,
      createPasswordPolicy(),
      "New password: ",
      "Confirm new password: "
    );
    const confirmed = await terminal.confirmExact(
      "Type SET PASSWORD to continue: ",
      "SET PASSWORD"
    );

    if (!confirmed) {
      throw new CliError("CLI_CONFIRMATION_REQUIRED");
    }

    const passwordHash = await (options.hasher ?? createArgon2PasswordHasher()).hash(password);
    const { repository, disconnect } = createRepository(options);

    try {
      const service = createCliUserService({ repository });
      const output = await service.setPassword({
        email,
        now: (options.clock ?? (() => new Date()))(),
        passwordHash,
        requestId
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

function createRepository(options: UserSetPasswordCommandOptions): {
  disconnect: () => Promise<void>;
  repository: CliUserRepository;
} {
  if (options.repository !== undefined) {
    return {
      disconnect: async () => undefined,
      repository: options.repository
    };
  }

  const env = parseDatabaseEnv(options.processEnv ?? process.env);
  const prisma = createPrismaClient({
    databaseUrl: env.DATABASE_URL
  });

  return {
    disconnect: () => prisma.$disconnect(),
    repository: createPrismaCliUserRepository({ prisma: prisma as PrismaClient })
  };
}

if (isDirectRun()) {
  void runUserSetPasswordCommand().then((code) => {
    process.exitCode = code;
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
