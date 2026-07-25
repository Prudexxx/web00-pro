import { SignJWT, jwtVerify } from "jose";
import { AppError } from "../../lib/errors.js";
import type {
  AccessTokenService,
  AuthRole,
  SignAccessTokenInput,
  VerifiedAccessToken
} from "./auth.types.js";

export interface CreateAccessTokenServiceOptions {
  audience: "web00-admin";
  issuer: "web00-backend";
  secret: Uint8Array;
  ttlSeconds: number;
}

export function createAccessTokenService(
  options: CreateAccessTokenServiceOptions
): AccessTokenService {
  return {
    sign: (input) => signAccessToken(input, options),
    verify: (token) => verifyAccessToken(token, options)
  };
}

async function signAccessToken(
  input: SignAccessTokenInput,
  options: CreateAccessTokenServiceOptions
): Promise<string> {
  return new SignJWT({
    role: input.role,
    sessionId: input.sessionId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setJti(input.tokenId)
    .setIssuedAt()
    .setExpirationTime(`${options.ttlSeconds}s`)
    .sign(options.secret);
}

async function verifyAccessToken(
  token: string,
  options: CreateAccessTokenServiceOptions
): Promise<VerifiedAccessToken> {
  try {
    const result = await jwtVerify(token, options.secret, {
      algorithms: ["HS256"],
      audience: options.audience,
      issuer: options.issuer
    });
    const payload = result.payload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.sessionId !== "string" ||
      (payload.role !== "admin" && payload.role !== "editor")
    ) {
      throw unauthorized();
    }

    return {
      audience: options.audience,
      expiresAtEpochSeconds: payload.exp,
      issuedAtEpochSeconds: payload.iat,
      issuer: options.issuer,
      role: payload.role as AuthRole,
      sessionId: payload.sessionId,
      subject: payload.sub,
      tokenId: payload.jti
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw unauthorized();
  }
}

export function unauthorized(): AppError {
  return new AppError({
    code: "UNAUTHORIZED",
    message: "Authentication required.",
    statusCode: 401
  });
}
