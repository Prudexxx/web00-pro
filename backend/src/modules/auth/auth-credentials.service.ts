import { AppError } from "../../lib/errors.js";
import type {
  AuthRepository,
  CredentialVerifier,
  PasswordHasher,
  VerifiedCredentials,
  VerifyCredentialsInput
} from "./auth.types.js";
import { normalizeEmail as normalizeLoginEmail } from "./auth.schemas.js";

export function normalizeEmail(email: string): string {
  return normalizeLoginEmail(email);
}

export interface CreateCredentialVerifierOptions {
  hasher: PasswordHasher;
  repository: Pick<AuthRepository, "findUserByEmail">;
}

export function createCredentialVerifier(
  options: CreateCredentialVerifierOptions
): CredentialVerifier {
  return {
    verify: async (input) => verifyCredentials(input, options)
  };
}

async function verifyCredentials(
  input: VerifyCredentialsInput,
  options: CreateCredentialVerifierOptions
): Promise<VerifiedCredentials> {
  const email = normalizeEmail(input.email);
  const user = await options.repository.findUserByEmail(email);

  if (user === null || !user.active) {
    await options.hasher.verifyDummy(input.password);
    throw invalidCredentials();
  }

  const verified = await options.hasher.verify(user.passwordHash, input.password);

  if (!verified) {
    throw invalidCredentials();
  }

  return user;
}

function invalidCredentials(): AppError {
  return new AppError({
    code: "INVALID_CREDENTIALS",
    message: "Invalid email or password.",
    statusCode: 401
  });
}
