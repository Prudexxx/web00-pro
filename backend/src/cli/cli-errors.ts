import { AppError } from "../lib/errors.js";
import type { CliOutput } from "./cli.types.js";

export type CliErrorCode =
  | "USER_NOT_FOUND"
  | "USER_EMAIL_CONFLICT"
  | "USER_ROLE_UNCHANGED"
  | "USER_ALREADY_DISABLED"
  | "USER_ALREADY_ACTIVE"
  | "SELF_ROLE_CHANGE_FORBIDDEN"
  | "SELF_DISABLE_FORBIDDEN"
  | "LAST_ACTIVE_ADMIN"
  | "BOOTSTRAP_ALREADY_COMPLETED"
  | "INTERACTIVE_TTY_REQUIRED"
  | "PASSWORD_CONFIRMATION_MISMATCH"
  | "CLI_CONFIRMATION_REQUIRED"
  | "CONCURRENT_MODIFICATION"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

const CLI_MESSAGES: Record<CliErrorCode, string> = {
  BOOTSTRAP_ALREADY_COMPLETED: "Admin bootstrap has already been completed.",
  CLI_CONFIRMATION_REQUIRED: "Required confirmation was not provided.",
  CONCURRENT_MODIFICATION:
    "The operation conflicted with another update. Run the command again.",
  CONFIGURATION_ERROR: "Configuration is invalid.",
  INTERACTIVE_TTY_REQUIRED: "Interactive terminal is required.",
  INTERNAL_ERROR: "Internal error.",
  LAST_ACTIVE_ADMIN: "At least one active admin must remain.",
  PASSWORD_CONFIRMATION_MISMATCH: "Password confirmation does not match.",
  SELF_DISABLE_FORBIDDEN: "You cannot disable your own user.",
  SELF_ROLE_CHANGE_FORBIDDEN: "You cannot change your own role.",
  USER_ALREADY_ACTIVE: "User is already active.",
  USER_ALREADY_DISABLED: "User is already disabled.",
  USER_EMAIL_CONFLICT: "Email is already in use.",
  USER_NOT_FOUND: "User was not found.",
  USER_ROLE_UNCHANGED: "User already has this role."
};

export class CliError extends Error {
  public readonly code: CliErrorCode;
  public readonly exitCode: number;

  public constructor(code: CliErrorCode, message = CLI_MESSAGES[code], exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function cliError(code: CliErrorCode): CliError {
  return new CliError(code);
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof AppError && error.code in CLI_MESSAGES) {
    return new CliError(error.code as CliErrorCode);
  }

  return new CliError("INTERNAL_ERROR");
}

export function toCliErrorOutput(error: unknown, requestId?: string): CliOutput {
  const cli = toCliError(error);

  return {
    code: cli.code,
    message: cli.message,
    ...(requestId === undefined ? {} : { requestId })
  };
}
