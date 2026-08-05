import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AppError } from "../../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../../auth/auth.types.js";

export type PagesCatalogPublicationAction = "create" | "delete" | "update";
export type PagesCatalogPublicationStatus =
  | "preparing"
  | "pull_request_open"
  | "validating"
  | "merge_queued"
  | "merged"
  | "deploying"
  | "published"
  | "failed"
  | "version_conflict"
  | "setup_required";

export interface PagesCatalogCardFile {
  blobSha: string;
  content: string;
}

export interface PagesCatalogRequiredCheckStatus {
  configured: boolean;
  status: "failure" | "pending" | "success";
}

export interface PagesCatalogPublicationRecord {
  action?: PagesCatalogPublicationAction | undefined;
  autoMergeEnabled?: boolean | undefined;
  branch?: string | undefined;
  cardId?: string | undefined;
  checkStatus?: "failure" | "pending" | "success" | undefined;
  code?: string | undefined;
  body?: string | undefined;
  mergeCommitSha?: string | null;
  mergeableState?: string | undefined;
  nodeId?: string | undefined;
  number?: number | undefined;
  pagesStatus?: "failure" | "pending" | "success" | null;
  prNumber?: number | undefined;
  pullRequestNodeId?: string | undefined;
  requestId?: string | undefined;
  requestFingerprint?: string | undefined;
  state?: "closed" | "merged" | "open" | undefined;
  url?: string | undefined;
}

export interface PagesCatalogGitHubProvider {
  createBranch(input: { branch: string; fromSha: string }): Promise<void>;
  createCatalogPullRequest(input: {
    action: PagesCatalogPublicationAction;
    body: string;
    branch: string;
    cardId: string;
    requestId: string;
    title: string;
  }): Promise<{ nodeId: string; number: number; url: string }>;
  createOrUpdateCardCommit(input: {
    branch: string;
    content: string;
    expectedBlobSha: string | null;
    message: string;
    path: string;
  }): Promise<{ commitSha: string }>;
  deleteCardCommit(input: {
    branch: string;
    expectedBlobSha: string;
    message: string;
    path: string;
  }): Promise<{ commitSha: string }>;
  deleteTemporaryBranch?(input: { branch: string }): Promise<void>;
  enableAutoMerge(input: {
    mergeMethod: "SQUASH";
    pullRequestNodeId: string;
  }): Promise<void>;
  findPublicationRequest(requestId: string): Promise<PagesCatalogPublicationRecord | null>;
  getBaseBranchHead(): Promise<string>;
  getBranchHead?(input: { branch: string }): Promise<string | null>;
  getCatalogCard(cardId: string, options?: { ref?: string }): Promise<PagesCatalogCardFile | null>;
  getCurrentPagesDeploymentStatus?(): Promise<{
    headSha?: string | null;
    status: "failure" | "pending" | "success";
  }>;
  getRepositorySetup?(): Promise<{ configured: boolean; code?: "GITHUB_REPOSITORY_SETUP_REQUIRED" }>;
  getRequiredCatalogCheckStatus(request: PagesCatalogPublicationRecord): Promise<PagesCatalogRequiredCheckStatus>;
}

export interface PagesCatalogPublicationStartInput {
  action: PagesCatalogPublicationAction;
  actor: AuthenticatedPrincipal;
  card: Record<string, unknown> | null;
  cardId: string;
  expectedBlobSha: string | null;
  now: Date;
  requestId: string;
}

export interface PagesCatalogPublicationDto {
  action: PagesCatalogPublicationAction;
  buttonLabel: string;
  cardId: string;
  code?: string;
  mergeCommitSha?: string;
  noOp: boolean;
  operationId: string;
  prNumber?: number;
  requestId: string;
  retryable: boolean;
  stableStatus: string;
  status: PagesCatalogPublicationStatus;
  statusUrl: string;
}

export interface PagesCatalogPublicationService {
  getCatalogCard(cardId: string): Promise<{
    blobSha: string | null;
    card: Record<string, unknown> | null;
    cardId: string;
  }>;
  getPagesPublicationStatus(requestId: string): Promise<PagesCatalogPublicationDto>;
  startPagesPublication(input: PagesCatalogPublicationStartInput): Promise<PagesCatalogPublicationDto>;
}

const CARD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG_CARDS_ROOT = "catalog/cards";

export function createPagesCatalogPublicationService(options: {
  allowedMediaOrigin?: string;
  github: PagesCatalogGitHubProvider;
  now?: () => Date;
  serializeCanonicalCatalogCard?: (card: Record<string, unknown>) => Promise<string> | string;
}): PagesCatalogPublicationService {
  const serializeCanonicalCatalogCard =
    options.serializeCanonicalCatalogCard ?? defaultSerializeCanonicalCatalogCard;
  const allowedMediaOrigin = normalizeAllowedMediaOrigin(options.allowedMediaOrigin);

  return {
    async getCatalogCard(cardId) {
      assertCardId(cardId);
      await assertRepositoryConfigured(options.github);
      const file = await options.github.getCatalogCard(cardId);

      if (file === null) {
        return {
          blobSha: null,
          card: null,
          cardId
        };
      }

      return {
        blobSha: file.blobSha,
        card: JSON.parse(file.content) as Record<string, unknown>,
        cardId
      };
    },

    async getPagesPublicationStatus(requestId) {
      assertRequestId(requestId);
      const existing = await options.github.findPublicationRequest(requestId);
      if (existing === null) {
        throw new AppError({
          code: "SITE_NOT_FOUND",
          message: "Publication request not found.",
          statusCode: 404
        });
      }

      return reconcileGitHubPublicationStatus(options.github, requestId, existing);
    },

    async startPagesPublication(input) {
      assertStartInput(input);
      assertCardIdentity(input);
      assertCardMedia(input.card, allowedMediaOrigin);
      const requestFingerprint = await createPagesPublicationRequestFingerprint(input, serializeCanonicalCatalogCard);
      const existing = await options.github.findPublicationRequest(input.requestId);
      if (existing !== null) {
        assertIdempotentReplay(existing, requestFingerprint);
        return reconcileGitHubPublicationStatus(options.github, input.requestId, existing);
      }

      await assertRepositoryConfigured(options.github);

      const path = catalogCardPath(input.cardId);
      const current = await options.github.getCatalogCard(input.cardId);
      const mutation = await planCardMutation(input, current, serializeCanonicalCatalogCard);

      if (mutation.kind === "noop") {
        return noOpPublicationDto(options.github, {
          action: input.action,
          cardId: input.cardId,
          noOp: true,
          requestId: input.requestId
        });
      }

      const mainSha = await options.github.getBaseBranchHead();
      const branch = `catalog/publish/${input.requestId}`;
      const branchExisted = await ensurePublicationBranch(options.github, {
        branch,
        fromSha: mainSha
      });
      const branchCurrent = branchExisted
        ? await options.github.getCatalogCard(input.cardId, { ref: branch })
        : current;

      const commitMessage = `catalog: ${input.action} ${input.cardId}`;
      const commit = planBranchCommit(mutation, branchCurrent);
      if (commit?.kind === "delete") {
        await options.github.deleteCardCommit({
          branch,
          expectedBlobSha: commit.expectedBlobSha,
          message: commitMessage,
          path
        });
      } else if (commit?.kind === "write") {
        await options.github.createOrUpdateCardCommit({
          branch,
          content: commit.content,
          expectedBlobSha: commit.expectedBlobSha,
          message: commitMessage,
          path
        });
      }

      const pullRequest = await options.github.createCatalogPullRequest({
        action: input.action,
        body: renderPullRequestBody({
          action: input.action,
          cardId: input.cardId,
          expectedBlobSha: input.expectedBlobSha,
          requestFingerprint,
          requestId: input.requestId
        }),
        branch,
        cardId: input.cardId,
        requestId: input.requestId,
        title: `Catalog ${input.action}: ${input.cardId}`
      });
      const request: PagesCatalogPublicationRecord = {
        action: input.action,
        branch,
        cardId: input.cardId,
        nodeId: pullRequest.nodeId,
        number: pullRequest.number,
        prNumber: pullRequest.number,
        pullRequestNodeId: pullRequest.nodeId,
        requestId: input.requestId,
        requestFingerprint,
        state: "open",
        url: pullRequest.url
      };

      return reconcileGitHubPublicationStatus(options.github, input.requestId, request);
    }
  };
}

async function noOpPublicationDto(
  github: PagesCatalogGitHubProvider,
  input: {
    action: PagesCatalogPublicationAction;
    cardId: string;
    noOp: true;
    requestId: string;
  }
): Promise<PagesCatalogPublicationDto> {
  const pages = github.getCurrentPagesDeploymentStatus === undefined
    ? { status: "pending" as const }
    : await github.getCurrentPagesDeploymentStatus();

  if (pages.status === "success") {
    return publicationDto({
      ...input,
      status: "published"
    });
  }

  return publicationDto({
    ...input,
    code: pages.status === "failure" ? "PAGES_DEPLOYMENT_FAILED" : "PAGES_DEPLOYMENT_NOT_VERIFIED",
    status: "failed"
  });
}

async function createPagesPublicationRequestFingerprint(
  input: PagesCatalogPublicationStartInput,
  serializeCanonicalCatalogCard: (card: Record<string, unknown>) => Promise<string> | string
): Promise<string> {
  return createHash("sha256")
    .update(JSON.stringify({
      action: input.action,
      cardId: input.cardId,
      cardSha256: input.card === null
        ? null
        : createHash("sha256").update(await serializeCanonicalCatalogCard(input.card)).digest("hex"),
      expectedBlobSha: input.expectedBlobSha,
      requestContract: "web00-direct-pages-catalog-publication-v1"
    }))
    .digest("hex");
}

function assertIdempotentReplay(
  existing: PagesCatalogPublicationRecord,
  requestFingerprint: string
): void {
  const existingFingerprint = readExistingRequestFingerprint(existing);

  if (existingFingerprint !== requestFingerprint) {
    throw new AppError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency key was reused for a different request.",
      statusCode: 409
    });
  }
}

function readExistingRequestFingerprint(existing: PagesCatalogPublicationRecord): string | null {
  if (typeof existing.requestFingerprint === "string" && /^[a-f0-9]{64}$/i.test(existing.requestFingerprint)) {
    return existing.requestFingerprint;
  }
  if (typeof existing.body === "string") {
    const bodyFingerprint = marker(existing.body, "WEB00-FINGERPRINT");
    if (/^[a-f0-9]{64}$/i.test(bodyFingerprint)) {
      return bodyFingerprint;
    }
  }

  return null;
}

async function planCardMutation(
  input: PagesCatalogPublicationStartInput,
  current: PagesCatalogCardFile | null,
  serializeCanonicalCatalogCard: (card: Record<string, unknown>) => Promise<string> | string
): Promise<
  | { kind: "delete"; expectedBlobSha: string }
  | { kind: "noop" }
  | { content: string; expectedBlobSha: string | null; kind: "write" }
> {
  if (input.action === "delete") {
    if (current === null) {
      return { kind: "noop" };
    }
    if (input.expectedBlobSha === null || input.expectedBlobSha !== current.blobSha) {
      throw versionConflict();
    }

    return {
      expectedBlobSha: current.blobSha,
      kind: "delete"
    };
  }

  if (input.card === null) {
    throw validationError("card", "Card is required for create/update.");
  }

  const content = await serializeCanonicalCatalogCard(input.card);

  if (input.action === "create") {
    if (current !== null) {
      if (current.content === content) {
        return { kind: "noop" };
      }
      throw versionConflict();
    }

    return {
      content,
      expectedBlobSha: null,
      kind: "write"
    };
  }

  if (input.expectedBlobSha === null || current === null || input.expectedBlobSha !== current.blobSha) {
    throw versionConflict();
  }
  if (current.content === content) {
    return { kind: "noop" };
  }

  return {
    content,
    expectedBlobSha: current.blobSha,
    kind: "write"
  };
}

async function ensurePublicationBranch(
  github: PagesCatalogGitHubProvider,
  input: { branch: string; fromSha: string }
): Promise<boolean> {
  const existingHead = github.getBranchHead === undefined
    ? null
    : await github.getBranchHead({ branch: input.branch });
  if (existingHead !== null) {
    return true;
  }

  try {
    await github.createBranch(input);
    return false;
  } catch (error) {
    if (isBranchAlreadyExists(error)) {
      return true;
    }

    throw error;
  }
}

function isBranchAlreadyExists(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "GITHUB_BRANCH_ALREADY_EXISTS";
}

function planBranchCommit(
  mutation:
    | { kind: "delete"; expectedBlobSha: string }
    | { content: string; expectedBlobSha: string | null; kind: "write" },
  current: PagesCatalogCardFile | null
):
  | { content: string; expectedBlobSha: string | null; kind: "write" }
  | { expectedBlobSha: string; kind: "delete" }
  | null {
  if (mutation.kind === "delete") {
    return current === null
      ? null
      : { expectedBlobSha: current.blobSha, kind: "delete" };
  }

  if (current?.content === mutation.content) {
    return null;
  }

  return {
    content: mutation.content,
    expectedBlobSha: current?.blobSha ?? mutation.expectedBlobSha,
    kind: "write"
  };
}

async function reconcileGitHubPublicationStatus(
  github: PagesCatalogGitHubProvider,
  requestId: string,
  request: PagesCatalogPublicationRecord
): Promise<PagesCatalogPublicationDto> {
  const action = readAction(request.action);
  const cardId = readCardId(request.cardId);
  const prNumber = typeof request.prNumber === "number"
    ? request.prNumber
    : typeof request.number === "number"
      ? request.number
      : undefined;

  if (request.state === "closed") {
    return publicationDto({
      action,
      cardId,
      code: "PULL_REQUEST_CLOSED",
      noOp: false,
      prNumber,
      requestId,
      retryable: false,
      status: "failed"
    });
  }
  if (isConflictedPullRequest(request)) {
    return publicationDto({
      action,
      cardId,
      code: "PULL_REQUEST_CONFLICTED",
      noOp: false,
      prNumber,
      requestId,
      retryable: false,
      status: "failed"
    });
  }

  if (request.state === "merged") {
    await deleteMergedTemporaryBranch(github, request);
    if (request.pagesStatus === "success") {
      return publicationDto({
        action,
        cardId,
        mergeCommitSha: readOptionalSha(request.mergeCommitSha),
        noOp: false,
        prNumber,
        requestId,
        status: "published"
      });
    }
    if (request.pagesStatus === "failure") {
      return publicationDto({
        action,
        cardId,
        code: "PAGES_DEPLOYMENT_FAILED",
        mergeCommitSha: readOptionalSha(request.mergeCommitSha),
        noOp: false,
        prNumber,
        requestId,
        status: "failed"
      });
    }

    return publicationDto({
      action,
      cardId,
      mergeCommitSha: readOptionalSha(request.mergeCommitSha),
      noOp: false,
      prNumber,
      requestId,
      status: "deploying"
    });
  }

  const check = await github.getRequiredCatalogCheckStatus(request);
  if (!check.configured) {
    return publicationDto({
      action,
      cardId,
      code: "GITHUB_REPOSITORY_SETUP_REQUIRED",
      noOp: false,
      prNumber,
      requestId,
      status: "setup_required"
    });
  }
  if (check.status === "failure") {
    return publicationDto({
      action,
      cardId,
      code: "CATALOG_VALIDATION_FAILED",
      noOp: false,
      prNumber,
      requestId,
      status: "failed"
    });
  }
  if (check.status === "success") {
    const pullRequestNodeId = readPullRequestNodeId(request);
    if (request.autoMergeEnabled !== true) {
      await github.enableAutoMerge({
        mergeMethod: "SQUASH",
        pullRequestNodeId
      });
    }

    return publicationDto({
      action,
      cardId,
      noOp: false,
      prNumber,
      requestId,
      status: "merge_queued"
    });
  }

  return publicationDto({
    action,
    cardId,
    noOp: false,
    prNumber,
    requestId,
    status: "validating"
  });
}

async function deleteMergedTemporaryBranch(
  github: PagesCatalogGitHubProvider,
  request: PagesCatalogPublicationRecord
): Promise<void> {
  if (github.deleteTemporaryBranch === undefined || typeof request.branch !== "string") {
    return;
  }

  await github.deleteTemporaryBranch({ branch: request.branch });
}

function publicationDto(input: {
  action: PagesCatalogPublicationAction;
  cardId: string;
  code?: string | undefined;
  mergeCommitSha?: string | undefined;
  noOp: boolean;
  prNumber?: number | undefined;
  requestId: string;
  retryable?: boolean | undefined;
  status: PagesCatalogPublicationStatus;
}): PagesCatalogPublicationDto {
  const labels = labelsForStatus(input.status);

  return {
    action: input.action,
    buttonLabel: labels.buttonLabel,
    cardId: input.cardId,
    ...(input.code === undefined ? {} : { code: input.code }),
    ...(input.mergeCommitSha === undefined ? {} : { mergeCommitSha: input.mergeCommitSha }),
    noOp: input.noOp,
    operationId: input.requestId,
    ...(input.prNumber === undefined ? {} : { prNumber: input.prNumber }),
    requestId: input.requestId,
    retryable: input.retryable ?? (input.status === "failed" || input.status === "setup_required"),
    stableStatus: labels.stableStatus,
    status: input.status,
    statusUrl: `/api/admin/publication/pages/${input.requestId}`
  };
}

function isConflictedPullRequest(request: PagesCatalogPublicationRecord): boolean {
  return request.mergeableState === "dirty" ||
    request.mergeableState === "conflicting" ||
    request.mergeableState === "unknown_conflict";
}

function labelsForStatus(status: PagesCatalogPublicationStatus): {
  buttonLabel: string;
  stableStatus: string;
} {
  switch (status) {
    case "preparing":
    case "pull_request_open":
      return { buttonLabel: "Публикуется", stableStatus: "Публикуется" };
    case "validating":
    case "merge_queued":
      return { buttonLabel: "Проверяется", stableStatus: "Проверяется" };
    case "merged":
    case "deploying":
      return { buttonLabel: "Развёртывается", stableStatus: "Развёртывается" };
    case "published":
      return { buttonLabel: "Опубликовано", stableStatus: "Опубликовано" };
    case "version_conflict":
      return { buttonLabel: "Конфликт версии", stableStatus: "Конфликт версии" };
    case "failed":
    case "setup_required":
      return { buttonLabel: "Ошибка публикации", stableStatus: "Ошибка публикации" };
  }
}

function renderPullRequestBody(input: {
  action: PagesCatalogPublicationAction;
  cardId: string;
  expectedBlobSha: string | null;
  requestFingerprint: string;
  requestId: string;
}): string {
  return [
    "WEB00 Direct Pages catalog publication.",
    "",
    `WEB00-REQUEST-ID: ${input.requestId}`,
    `WEB00-CARD-ID: ${input.cardId}`,
    `WEB00-ACTION: ${input.action}`,
    `WEB00-EXPECTED-BLOB-SHA: ${input.expectedBlobSha ?? "null"}`,
    `WEB00-FINGERPRINT: ${input.requestFingerprint}`
  ].join("\n");
}

function marker(body: string, key: string): string {
  const line = body.split(/\r?\n/).find((item) => item.startsWith(`${key}: `));
  return line?.slice(key.length + 2).trim() ?? "";
}

async function assertRepositoryConfigured(github: PagesCatalogGitHubProvider): Promise<void> {
  const setup = github.getRepositorySetup === undefined
    ? { configured: true }
    : await github.getRepositorySetup();

  if (!setup.configured) {
    throw new AppError({
      code: setup.code ?? "GITHUB_REPOSITORY_SETUP_REQUIRED",
      message: "GitHub repository publication is not configured.",
      statusCode: 503
    });
  }
}

async function defaultSerializeCanonicalCatalogCard(card: Record<string, unknown>): Promise<string> {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "..", "scripts", "build-pages-catalog.mjs")).href;
  const module = await import(moduleUrl) as { serializeCanonicalCatalogCard?: unknown };

  if (typeof module.serializeCanonicalCatalogCard !== "function") {
    throw new AppError({
      code: "GITHUB_REPOSITORY_SETUP_REQUIRED",
      message: "Canonical Pages catalog serializer is unavailable.",
      statusCode: 503
    });
  }

  return module.serializeCanonicalCatalogCard(card) as string;
}

function assertStartInput(input: PagesCatalogPublicationStartInput): void {
  assertRequestId(input.requestId);
  assertCardId(input.cardId);
  if (input.action !== "create" && input.action !== "update" && input.action !== "delete") {
    throw validationError("action", "Unsupported publication action.");
  }
  if (input.action !== "create" && input.expectedBlobSha !== null && !/^[a-zA-Z0-9_-]+$/.test(input.expectedBlobSha)) {
    throw validationError("expectedBlobSha", "Invalid expected blob SHA.");
  }
}

function assertCardIdentity(input: PagesCatalogPublicationStartInput): void {
  if (input.action === "delete") {
    return;
  }
  if (input.card === null) {
    return;
  }
  if (input.card.id !== input.cardId) {
    throw validationError("card.id", "Catalog card id must match the immutable card id.");
  }
  if (input.card.slug !== input.cardId) {
    throw validationError("card.slug", "Catalog card slug must match the immutable card id.");
  }
}

function assertCardMedia(card: Record<string, unknown> | null, allowedMediaOrigin: string | null): void {
  if (card === null) {
    return;
  }

  assertMediaUrl(card.previewImage, "card.previewImage", allowedMediaOrigin);
  if (Array.isArray(card.galleryImages)) {
    card.galleryImages.forEach((url, index) => {
      assertMediaUrl(url, `card.galleryImages.${index}`, allowedMediaOrigin);
    });
  }
}

function assertMediaUrl(value: unknown, path: string, allowedMediaOrigin: string | null): void {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    throw validationError(path, "Catalog media URL is required.");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    assertAbsoluteMediaUrl(text, path, allowedMediaOrigin);
    return;
  }

  assertRelativeMediaUrl(text, path);
}

function assertAbsoluteMediaUrl(value: string, path: string, allowedMediaOrigin: string | null): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw validationError(path, "Catalog media URL is invalid.");
  }

  if (
    allowedMediaOrigin === null ||
    parsed.protocol !== "https:" ||
    parsed.origin !== allowedMediaOrigin ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    !parsed.pathname.startsWith("/storage/v1/object/public/web00-catalog-images/") ||
    repeatedlyDecode(parsed.pathname).split("/").includes("..")
  ) {
    throw validationError(path, "Catalog media URL must use the configured public image bucket.");
  }
}

function assertRelativeMediaUrl(value: string, path: string): void {
  const decoded = repeatedlyDecode(value);

  if (
    value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decoded) ||
    !/^[a-z0-9][a-z0-9/_.,+@%=-]*(?:#[a-z0-9._%=-]+)?$/i.test(value)
  ) {
    throw validationError(path, "Catalog media URL is invalid.");
  }
}

function normalizeAllowedMediaOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function repeatedlyDecode(value: string): string {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        return decoded;
      }
      current = decoded;
    } catch {
      return current;
    }
  }

  return current;
}

function assertRequestId(requestId: string): void {
  if (!UUID_RE.test(requestId)) {
    throw validationError("requestId", "Invalid request id.");
  }
}

function assertCardId(cardId: string): void {
  if (!CARD_ID_RE.test(cardId)) {
    throw validationError("cardId", "Invalid card id.");
  }
}

function catalogCardPath(cardId: string): string {
  assertCardId(cardId);
  return `${CATALOG_CARDS_ROOT}/${cardId}.json`;
}

function readAction(action: unknown): PagesCatalogPublicationAction {
  return action === "create" || action === "update" || action === "delete"
    ? action
    : "update";
}

function readCardId(cardId: unknown): string {
  return typeof cardId === "string" && CARD_ID_RE.test(cardId) ? cardId : "unknown-card";
}

function readPullRequestNodeId(request: PagesCatalogPublicationRecord): string {
  const nodeId = typeof request.pullRequestNodeId === "string"
    ? request.pullRequestNodeId
    : typeof request.nodeId === "string"
      ? request.nodeId
      : "";
  if (nodeId.length === 0) {
    throw new AppError({
      code: "GITHUB_REPOSITORY_SETUP_REQUIRED",
      message: "GitHub pull request node id is unavailable.",
      statusCode: 503
    });
  }

  return nodeId;
}

function readOptionalSha(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value : undefined;
}

function versionConflict(): AppError {
  return new AppError({
    code: "VERSION_CONFLICT",
    message: "Catalog card changed since the editor loaded it.",
    statusCode: 409
  });
}

function validationError(path: string, message: string): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details: [{ message, path }],
    message: "Invalid request.",
    statusCode: 400
  });
}
