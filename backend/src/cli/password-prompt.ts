import { CliError } from "./cli-errors.js";
import type {
  InteractiveTerminal,
  PasswordPolicy,
  PasswordPolicyResult
} from "./cli.types.js";
import { parseLoginBody } from "../modules/auth/auth.schemas.js";

const MIN_PASSWORD_CODE_POINTS = 15;
const MAX_PASSWORD_CODE_POINTS = 1024;

export function createPasswordPolicy(): PasswordPolicy {
  return {
    validate: validatePassword
  };
}

export async function promptConfirmedPassword(
  terminal: InteractiveTerminal,
  policy: PasswordPolicy,
  label = "Password: ",
  confirmationLabel = "Confirm password: "
): Promise<string> {
  const password = await terminal.promptSecret(label);
  const confirmation = await terminal.promptSecret(confirmationLabel);

  if (password !== confirmation) {
    throw new CliError("PASSWORD_CONFIRMATION_MISMATCH");
  }

  const result = policy.validate(password);

  if (!result.ok) {
    throw new CliError("CLI_CONFIRMATION_REQUIRED", result.message);
  }

  return password;
}

function validatePassword(password: string): PasswordPolicyResult {
  const codePoints = [...password].length;

  if (codePoints < MIN_PASSWORD_CODE_POINTS) {
    return {
      code: "PASSWORD_TOO_SHORT",
      message: "Password must contain at least 15 Unicode code points.",
      ok: false
    };
  }

  if (codePoints > MAX_PASSWORD_CODE_POINTS) {
    return {
      code: "PASSWORD_TOO_LONG",
      message: "Password must contain at most 1024 Unicode code points.",
      ok: false
    };
  }

  try {
    parseLoginBody({
      email: "cli-password-policy@example.com",
      password
    });
  } catch {
    return {
      code: "PASSWORD_NOT_LOGIN_COMPATIBLE",
      message: "Password is not compatible with the login API.",
      ok: false
    };
  }

  return { ok: true };
}
