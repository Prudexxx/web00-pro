import type { Request } from "express";
import type { AppLogger } from "../../lib/logger.js";

export type AuthRole = "admin" | "editor";

export interface AuthUserRecord {
  active: boolean;
  email: string;
  id: string;
  passwordHash: string;
  role: AuthRole;
}

export interface SafeAuthUser {
  email: string;
  id: string;
  role: AuthRole;
}

export interface AuthenticatedPrincipal extends SafeAuthUser {
  sessionId: string;
  tokenId: string;
}

export interface AuthRequest extends Request {
  auth?: AuthenticatedPrincipal;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export interface VerifyCredentialsInput {
  email: string;
  password: string;
}

export type VerifiedCredentials = AuthUserRecord;

export interface CredentialVerifier {
  verify(input: VerifyCredentialsInput): Promise<VerifiedCredentials>;
}

export interface SignAccessTokenInput {
  role: AuthRole;
  sessionId: string;
  tokenId: string;
  userId: string;
}

export interface VerifiedAccessToken {
  audience: "web00-admin";
  expiresAtEpochSeconds: number;
  issuedAtEpochSeconds: number;
  issuer: "web00-backend";
  role: AuthRole;
  sessionId: string;
  subject: string;
  tokenId: string;
}

export interface AccessTokenService {
  sign(input: SignAccessTokenInput): Promise<string>;
  verify(token: string): Promise<VerifiedAccessToken>;
}

export interface RefreshTokenService {
  generateRawToken(): string;
  hashRawToken(rawToken: string): string;
}

export interface SerializeRefreshCookieInput {
  expiresAt: Date;
  maxAgeSeconds: number;
  rawToken: string;
}

export interface AuthCookieService {
  clearRefreshCookie(): string;
  parseRefreshCookie(header: string | undefined): string | null;
  serializeRefreshCookie(input: SerializeRefreshCookieInput): string;
}

export interface RefreshSessionRecord {
  expiresAt: Date;
  familyId: string;
  id: string;
  replacedBySessionId: string | null;
  revokedAt: Date | null;
  tokenHash: string;
  userId: string;
}

export interface UserSessionContext {
  session: {
    expiresAt: Date;
    id: string;
    revokedAt: Date | null;
    userId: string;
  };
  user: {
    active: boolean;
    email: string;
    id: string;
    role: AuthRole;
  };
}

export interface SafeAuditInput {
  action:
    | "auth.login.success"
    | "auth.logout"
    | "auth.refresh.reuse_detected"
    | "auth.user_disabled";
  actorUserId?: string | null;
  entityId?: string | null;
  ipHash?: string | null;
  requestId: string;
  userAgentHash?: string | null;
}

export interface CommitLoginSuccessInput {
  audit: SafeAuditInput;
  lastLoginAt: Date;
  session: {
    expiresAt: Date;
    familyId: string;
    id: string;
    ipHash?: string | null;
    tokenHash: string;
    userAgentHash?: string | null;
    userId: string;
  };
}

export interface RotateRefreshSessionInput {
  audit?: SafeAuditInput;
  currentSession: RefreshSessionRecord;
  now: Date;
  successor: {
    id: string;
    ipHash?: string | null;
    tokenHash: string;
    userAgentHash?: string | null;
  };
}

export type RotateRefreshSessionResult =
  | { kind: "rotated"; session: RefreshSessionRecord }
  | { kind: "reuse" };

export interface RevokeRefreshFamilyWithAuditInput {
  audit: SafeAuditInput;
  familyId: string;
  now: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findActiveUserById(userId: string): Promise<SafeAuthUser | null>;
  findSessionContext(input: {
    sessionId: string;
    userId: string;
  }): Promise<UserSessionContext | null>;
  findRefreshSessionByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  commitLoginSuccess(input: CommitLoginSuccessInput): Promise<RefreshSessionRecord>;
  rotateRefreshSession(input: RotateRefreshSessionInput): Promise<RotateRefreshSessionResult>;
  revokeRefreshFamilyWithAudit(input: RevokeRefreshFamilyWithAuditInput): Promise<void>;
}

export interface AuthWarningLogEntry {
  emailHash?: string;
  environment: string;
  event: "auth.login.failed";
  level: "warn";
  requestId: string;
  service: string;
  time: string;
}

export interface AuthAuditService {
  createSafeAuditInput(input: SafeAuditInput): SafeAuditInput;
  logFailedLogin(input: {
    email: string;
    logger: AppLogger;
    requestId: string;
    service: string;
    time: Date;
    environment: string;
  }): void;
}

export interface LoginInput {
  email: string;
  ipHash?: string | null;
  password: string;
  requestId: string;
  userAgentHash?: string | null;
}

export interface LoginResult {
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshExpiresAt: Date;
  refreshMaxAgeSeconds: number;
  refreshToken: string;
  user: SafeAuthUser;
}

export interface RefreshInput {
  ipHash?: string | null;
  rawRefreshToken: string | null;
  requestId: string;
  userAgentHash?: string | null;
}

export type RefreshResult = LoginResult;

export interface LogoutInput {
  rawRefreshToken: string | null;
  requestId: string;
}

export interface MeResult {
  user: SafeAuthUser;
}

export interface AuthService {
  authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal>;
  getMe(principal: AuthenticatedPrincipal): Promise<MeResult>;
  login(input: LoginInput): Promise<LoginResult>;
  logout(input: LogoutInput): Promise<void>;
  refresh(input: RefreshInput): Promise<RefreshResult>;
}

export interface AuthServiceDependencies {
  accessTokenTtlSeconds: number;
  accessTokens: AccessTokenService;
  audit: AuthAuditService;
  clock: () => Date;
  credentials: CredentialVerifier;
  environment: string;
  logger: AppLogger;
  randomUUID: () => string;
  refreshTokenTtlSeconds: number;
  refreshTokens: RefreshTokenService;
  repository: AuthRepository;
  serviceName: string;
}
