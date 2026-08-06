import { createHash } from "node:crypto";
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
  | "superseded"
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
  expectedBlobSha?: string | null | undefined;
  headSha?: string | undefined;
  lifecycleAction?: PagesCatalogPublicationLifecycleAction | undefined;
  mergeCommitSha?: string | null;
  mergeableState?: string | undefined;
  nodeId?: string | undefined;
  number?: number | undefined;
  pagesStatus?: "failure" | "pending" | "success" | null;
  noOp?: boolean | undefined;
  prNumber?: number | undefined;
  pullRequestNodeId?: string | undefined;
  requestId?: string | undefined;
  requestFingerprint?: string | undefined;
  siteId?: string | undefined;
  state?: "closed" | "marker" | "merged" | "open" | undefined;
  testMergeSha?: string | null | undefined;
  url?: string | undefined;
}

export interface PagesCatalogGitHubProvider {
  createBranch(input: { branch: string; fromSha: string }): Promise<void>;
  createCatalogPullRequest(input: {
    action: PagesCatalogPublicationAction;
    body: string;
    branch: string;
    cardId: string;
    lifecycleAction: PagesCatalogPublicationLifecycleAction;
    requestId: string;
    siteId?: string | undefined;
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
  createPublicationMarkerCommit(input: {
    action: PagesCatalogPublicationAction;
    branch: string;
    cardId: string;
    expectedBlobSha: string | null;
    fromSha: string;
    lifecycleAction: PagesCatalogPublicationLifecycleAction;
    message: string;
    noOp: boolean;
    requestFingerprint: string;
    requestId: string;
    siteId?: string | undefined;
  }): Promise<{ commitSha: string }>;
  getBaseBranchHead(): Promise<string>;
  getBranchHead?(input: { branch: string }): Promise<string | null>;
  getCatalogCard(cardId: string, options?: { ref?: string }): Promise<PagesCatalogCardFile | null>;
  getCurrentPagesDeploymentStatus?(): Promise<{
    headSha?: string | null;
    status: "failure" | "pending" | "success";
  }>;
  getPublicationBranchRequest?(requestId: string): Promise<PagesCatalogPublicationRecord | null>;
  getRepositorySetup?(): Promise<{ configured: boolean; code?: "GITHUB_REPOSITORY_SETUP_REQUIRED" }>;
  getRequiredCatalogCheckStatus(request: PagesCatalogPublicationRecord): Promise<PagesCatalogRequiredCheckStatus>;
  listRecentPublicationRequests?(input: { limit: number }): Promise<PagesCatalogPublicationRecord[]>;
  listRecentPublicationMarkerRequests?(input: { limit: number }): Promise<PagesCatalogPublicationRecord[]>;
}

export interface PagesCatalogPublicationStartInput {
  action: PagesCatalogPublicationAction;
  actor: AuthenticatedPrincipal;
  card: Record<string, unknown> | null;
  cardId: string;
  expectedBlobSha: string | null;
  lifecycleAction: PagesCatalogPublicationLifecycleAction;
  now: Date;
  requestId: string;
  siteId?: string | undefined;
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
  getPagesPublicationStatus(
    requestId: string,
    context?: { actor: AuthenticatedPrincipal; now: Date }
  ): Promise<PagesCatalogPublicationDto>;
  reconcilePagesPublicationLifecycle(input: {
    actor: AuthenticatedPrincipal;
    limit?: number | undefined;
    now: Date;
  }): Promise<PagesCatalogPublicationReconciliationDto>;
  startPagesPublication(input: PagesCatalogPublicationStartInput): Promise<PagesCatalogPublicationDto>;
}

export type PagesCatalogPublicationLifecycleAction = "delete" | "publish" | "unpublish";

export interface PagesCatalogPublicationReconciliationDto {
  failed: number;
  finalized: number;
  scanned: number;
}

export interface PagesCatalogPublicationReconciliationWorker {
  reconcileOnce(): Promise<PagesCatalogPublicationReconciliationDto>;
  start(): void;
  stop(): Promise<void>;
}

export interface PagesCatalogPublicationLifecycleFinalizer {
  finalize(input: {
    actor: AuthenticatedPrincipal;
    cardId: string;
    lifecycleAction: PagesCatalogPublicationLifecycleAction;
    now: Date;
    requestId: string;
    siteId: string;
  }): Promise<void> | void;
}

export function createPagesCatalogPublicationReconciliationWorker(options: {
  actor: AuthenticatedPrincipal;
  intervalMs?: number | undefined;
  limit?: number | undefined;
  now?: () => Date;
  onError?: ((error: unknown) => void) | undefined;
  service: PagesCatalogPublicationService;
}): PagesCatalogPublicationReconciliationWorker {
  const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs !== undefined
    ? Math.max(60_000, Math.trunc(options.intervalMs))
    : 300_000;
  const limit = normalizeReconciliationLimit(options.limit);
  const now = options.now ?? (() => new Date());
  let interval: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<PagesCatalogPublicationReconciliationDto> | null = null;

  async function reconcileOnce(): Promise<PagesCatalogPublicationReconciliationDto> {
    if (inFlight !== null) {
      return inFlight;
    }
    const run = options.service.reconcilePagesPublicationLifecycle({
      actor: options.actor,
      limit,
      now: now()
    });
    const tracked = run.finally(() => {
      inFlight = null;
    });
    inFlight = tracked;

    return tracked;
  }

  function reportError(error: unknown): void {
    try {
      if (options.onError !== undefined) {
        options.onError(error);
        return;
      }
      console.error("Direct Pages reconciliation failed.", safeErrorCode(error));
    } catch {
      // Error reporting must never turn a handled reconciliation failure into
      // an unhandled rejection.
    }
  }

  return {
    reconcileOnce,
    start() {
      if (interval !== null) {
        return;
      }
      interval = setInterval(() => {
        if (inFlight !== null) {
          return;
        }
        void reconcileOnce().catch(reportError);
      }, intervalMs);
      interval.unref?.();
    },
    async stop() {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      const active = inFlight;
      if (active !== null) {
        await active.catch(reportError);
      }
    }
  };
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }

  return "DIRECT_PAGES_RECONCILIATION_FAILED";
}

const CARD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATIVE_CATALOG_URL_RE = /^[a-z0-9][a-z0-9/_.,+@%=-]*(?:#[a-z0-9._%=-]+)?$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG_CARDS_ROOT = "catalog/cards";
const LEGACY_RELATIVE_MEDIA_CARD_IDS = new Set([
  "advokat",
  "cleaning",
  "digital-projects",
  "doma-bani",
  "drova",
  "krovlya",
  "massage",
  "mebel",
  "medicina",
  "narko-medicine",
  "odezhda",
  "rental-house",
  "ruberoid-roof",
  "site-custom",
  "uslugi"
]);

export function createPagesCatalogPublicationService(options: {
  allowedMediaOrigin?: string;
  github: PagesCatalogGitHubProvider;
  lifecycleFinalizer?: PagesCatalogPublicationLifecycleFinalizer | undefined;
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

    async getPagesPublicationStatus(requestId, context) {
      assertRequestId(requestId);
      const existing = await options.github.findPublicationRequest(requestId) ??
        await readPublicationBranchRequest(options.github, requestId);
      if (existing === null) {
        throw new AppError({
          code: "SITE_NOT_FOUND",
          message: "Publication request not found.",
          statusCode: 404
        });
      }

      if (isRecoverableNoOpMarkerRequest(existing)) {
        return reconcileNoOpMarkerPublication(options.github, existing, {
          actor: context?.actor,
          lifecycleFinalizer: options.lifecycleFinalizer,
          now: context?.now
        });
      }

      return reconcileGitHubPublicationStatus(options.github, requestId, existing, {
        actor: context?.actor,
        lifecycleFinalizer: options.lifecycleFinalizer,
        now: context?.now,
        siteId: existing.siteId
      });
    },

    async reconcilePagesPublicationLifecycle(input) {
      const limit = normalizeReconciliationLimit(input.limit);
      const pullRequests = options.github.listRecentPublicationRequests === undefined
        ? []
        : await options.github.listRecentPublicationRequests({ limit });
      const markerRequests = options.github.listRecentPublicationMarkerRequests === undefined
        ? []
        : await options.github.listRecentPublicationMarkerRequests({ limit });
      const seen = new Set(pullRequests.map((request) => request.requestId).filter((value): value is string => typeof value === "string"));
      const uniqueMarkerRequests = markerRequests.filter((request) => (
        typeof request.requestId === "string" && !seen.has(request.requestId)
      ));
      const recent = [
        ...uniqueMarkerRequests.filter(isRecoverableNoOpMarkerRequest),
        ...pullRequests.filter(isRecoverablePublicationRequest)
      ].slice(0, limit);
      let failed = 0;
      let finalized = 0;

      for (const request of recent) {
        const recoverablePullRequest = isRecoverablePublicationRequest(request);
        const recoverableMarkerRequest = isRecoverableNoOpMarkerRequest(request);
        if (!recoverablePullRequest && !recoverableMarkerRequest) {
          continue;
        }

        try {
          const result = recoverableMarkerRequest
            ? await reconcileNoOpMarkerPublication(options.github, request, {
                actor: input.actor,
                lifecycleFinalizer: options.lifecycleFinalizer,
                now: input.now
              })
            : await reconcileGitHubPublicationStatus(options.github, request.requestId!, request, {
                actor: input.actor,
                lifecycleFinalizer: options.lifecycleFinalizer,
                now: input.now,
                siteId: request.siteId
              });
          if (result.status === "published") {
            finalized += 1;
          } else if (result.status === "failed") {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }

      return {
        failed,
        finalized,
        scanned: recent.length
      };
    },

    async startPagesPublication(input) {
      assertStartInput(input);
      assertCardIdentity(input);
      const lifecycleAction = input.lifecycleAction;
      const requestFingerprint = await createPagesPublicationRequestFingerprint(input, serializeCanonicalCatalogCard);
      const branch = `catalog/publish/${input.requestId}`;
      const existing = await options.github.findPublicationRequest(input.requestId);
      if (existing !== null) {
        assertIdempotentReplay(existing, requestFingerprint);
        return reconcileGitHubPublicationStatus(options.github, input.requestId, existing, {
          actor: input.actor,
          lifecycleFinalizer: options.lifecycleFinalizer,
          now: input.now,
          siteId: input.siteId
        });
      }
      const branchRequest = await readPublicationBranchRequest(options.github, input.requestId);
      if (branchRequest !== null) {
        assertIdempotentReplay(branchRequest, requestFingerprint);
        if (isRecoverableNoOpMarkerRequest(branchRequest)) {
          return reconcileNoOpMarkerPublication(options.github, branchRequest, {
            actor: input.actor,
            lifecycleFinalizer: options.lifecycleFinalizer,
            now: input.now
          });
        }
      }

      await assertRepositoryConfigured(options.github);

      const path = catalogCardPath(input.cardId);
      const mainSha = await options.github.getBaseBranchHead();
      const current = await options.github.getCatalogCard(input.cardId, { ref: mainSha });
      assertCardMedia(input.card, allowedMediaOrigin, current, input.cardId);
      const mutation = await planCardMutation(input, current, serializeCanonicalCatalogCard);

      const branchState = branchRequest === null
        ? await createPublicationMarkerBranch(options.github, {
            branch,
            fromSha: mainSha,
            input,
            noOp: mutation.kind === "noop",
            requestFingerprint
          })
        : { existed: true };

      if (mutation.kind === "noop") {
        return reconcileNoOpMarkerPublication(options.github, {
          action: input.action,
          branch,
          cardId: input.cardId,
          expectedBlobSha: input.expectedBlobSha,
          lifecycleAction,
          noOp: true,
          requestFingerprint,
          requestId: input.requestId,
          siteId: input.siteId,
          state: "marker"
        }, {
          actor: input.actor,
          lifecycleFinalizer: options.lifecycleFinalizer,
          now: input.now
        });
      }

      const branchCurrent = branchState.existed
        ? await options.github.getCatalogCard(input.cardId, { ref: branch })
        : current;

      const commitMessage = renderCommitMessage({
        action: input.action,
        cardId: input.cardId,
        expectedBlobSha: input.expectedBlobSha,
        lifecycleAction,
        noOp: false,
        requestFingerprint,
        requestId: input.requestId,
        siteId: input.siteId
      });
      const commit = planBranchCommit(mutation, branchCurrent, branchState.existed);
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
          lifecycleAction,
          noOp: false,
          requestFingerprint,
          requestId: input.requestId,
          siteId: input.siteId
        }),
        branch,
        cardId: input.cardId,
        lifecycleAction,
        requestId: input.requestId,
        siteId: input.siteId,
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
        lifecycleAction,
        siteId: input.siteId,
        state: "open",
        url: pullRequest.url
      };

      return reconcileGitHubPublicationStatus(options.github, input.requestId, request, {
        actor: input.actor,
        lifecycleFinalizer: options.lifecycleFinalizer,
        now: input.now,
        siteId: input.siteId
      });
    }
  };
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
      lifecycleAction: input.lifecycleAction,
      requestContract: "web00-direct-pages-catalog-publication-v1",
      siteId: input.siteId
    }))
    .digest("hex");
}

function assertIdempotentReplay(
  existing: PagesCatalogPublicationRecord,
  requestFingerprint: string
): void {
  const existingFingerprint = readExistingRequestFingerprint(existing);

  if (existingFingerprint !== requestFingerprint) {
    throw idempotencyKeyReused();
  }
}

function idempotencyKeyReused(): AppError {
  return new AppError({
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "Idempotency key was reused for a different request.",
    statusCode: 409
  });
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
      if (input.expectedBlobSha !== null) {
        throw versionConflict();
      }
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

  if (input.lifecycleAction === "unpublish" && input.card === null) {
    if (current === null) {
      if (input.expectedBlobSha !== null) {
        throw versionConflict();
      }
      return { kind: "noop" };
    }
    throw validationError("card", "Inactive card is required to unpublish an existing catalog card.");
  }

  if (input.card === null) {
    throw validationError("card", "Card is required for create/update.");
  }

  const content = await serializeCanonicalCatalogCard(input.card);

  if (input.action === "create") {
    if (current !== null) {
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

async function createPublicationMarkerBranch(
  github: PagesCatalogGitHubProvider,
  input: {
    branch: string;
    fromSha: string;
    input: PagesCatalogPublicationStartInput;
    noOp: boolean;
    requestFingerprint: string;
  }
): Promise<{ existed: boolean }> {
  if (await readBranchHead(github, input.branch) !== null) {
    throw idempotencyKeyReused();
  }

  const markerCommit = await createPublicationMarkerCommit(github, input);
  try {
    await github.createBranch({
      branch: input.branch,
      fromSha: markerCommit.commitSha
    });
  } catch (error) {
    if (!isBranchAlreadyExists(error)) {
      throw error;
    }
    const racedRequest = await readPublicationBranchRequest(github, input.input.requestId);
    if (racedRequest === null) {
      throw idempotencyKeyReused();
    }
    assertIdempotentReplay(racedRequest, input.requestFingerprint);
    return { existed: true };
  }

  return { existed: false };
}

async function readPublicationBranchRequest(
  github: PagesCatalogGitHubProvider,
  requestId: string
): Promise<PagesCatalogPublicationRecord | null> {
  return github.getPublicationBranchRequest === undefined
    ? null
    : await github.getPublicationBranchRequest(requestId);
}

async function createPublicationMarkerCommit(
  github: PagesCatalogGitHubProvider,
  input: {
    branch: string;
    fromSha: string;
    input: PagesCatalogPublicationStartInput;
    noOp: boolean;
    requestFingerprint: string;
  }
): Promise<{ commitSha: string }> {
  return github.createPublicationMarkerCommit({
    action: input.input.action,
    branch: input.branch,
    cardId: input.input.cardId,
    expectedBlobSha: input.input.expectedBlobSha,
    fromSha: input.fromSha,
    lifecycleAction: input.input.lifecycleAction,
    message: renderCommitMessage({
      action: input.input.action,
      cardId: input.input.cardId,
      expectedBlobSha: input.input.expectedBlobSha,
      lifecycleAction: input.input.lifecycleAction,
      noOp: input.noOp,
      requestFingerprint: input.requestFingerprint,
      requestId: input.input.requestId,
      siteId: input.input.siteId
    }),
    noOp: input.noOp,
    requestFingerprint: input.requestFingerprint,
    requestId: input.input.requestId,
    ...(input.input.siteId === undefined ? {} : { siteId: input.input.siteId })
  });
}

async function readBranchHead(github: PagesCatalogGitHubProvider, branch: string): Promise<string | null> {
  return github.getBranchHead === undefined
    ? null
    : await github.getBranchHead({ branch });
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
  current: PagesCatalogCardFile | null,
  branchExisted: boolean
):
  | { content: string; expectedBlobSha: string | null; kind: "write" }
  | { expectedBlobSha: string; kind: "delete" }
  | null {
  if (!branchExisted) {
    return mutation;
  }

  if (mutation.kind === "delete") {
    if (current === null) {
      return null;
    }
    if (current.blobSha !== mutation.expectedBlobSha) {
      throw idempotencyKeyReused();
    }

    return mutation;
  }

  if (current?.content === mutation.content) {
    return null;
  }

  if (mutation.expectedBlobSha === null) {
    if (current !== null) {
      throw idempotencyKeyReused();
    }

    return mutation;
  }

  if (current === null || current.blobSha !== mutation.expectedBlobSha) {
    throw idempotencyKeyReused();
  }

  return {
    content: mutation.content,
    expectedBlobSha: mutation.expectedBlobSha,
    kind: "write"
  };
}

async function reconcileGitHubPublicationStatus(
  github: PagesCatalogGitHubProvider,
  requestId: string,
  request: PagesCatalogPublicationRecord,
  lifecycle?: {
    actor?: AuthenticatedPrincipal | undefined;
    lifecycleFinalizer?: PagesCatalogPublicationLifecycleFinalizer | undefined;
    now?: Date | undefined;
    siteId?: string | undefined;
  }
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
    if (request.pagesStatus === "success") {
      const currentness = await verifyMergedPublicationStillCurrent(github, request, cardId);
      if (currentness === "superseded") {
        await deleteMergedTemporaryBranch(github, request);
        return publicationDto({
          action,
          cardId,
          code: "PUBLICATION_SUPERSEDED",
          mergeCommitSha: readOptionalSha(request.mergeCommitSha),
          noOp: false,
          prNumber,
          requestId,
          retryable: false,
          status: "superseded"
        });
      }
      if (currentness === "unverified") {
        return publicationDto({
          action,
          cardId,
          code: "PUBLICATION_STATE_NOT_VERIFIED",
          mergeCommitSha: readOptionalSha(request.mergeCommitSha),
          noOp: false,
          prNumber,
          requestId,
          retryable: true,
          status: "failed"
        });
      }

      const finalized = await finalizePublicationLifecycle({
        action,
        actor: lifecycle?.actor,
        cardId,
        lifecycleFinalizer: lifecycle?.lifecycleFinalizer,
        lifecycleAction: request.lifecycleAction,
        now: lifecycle?.now,
        requestId,
        siteId: lifecycle?.siteId ?? request.siteId
      });
      if (finalized !== null) {
        return finalized;
      }
      await deleteMergedTemporaryBranch(github, request);
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
  if (typeof request.branch !== "string") {
    return;
  }

  await deleteTemporaryBranchBestEffort(github, request.branch);
}

async function deleteTemporaryBranchBestEffort(
  github: PagesCatalogGitHubProvider,
  branch: string
): Promise<void> {
  if (github.deleteTemporaryBranch === undefined) {
    return;
  }

  try {
    await github.deleteTemporaryBranch({ branch });
  } catch {
    // Branch cleanup is best-effort after a verified Pages deployment.
  }
}

async function verifyMergedPublicationStillCurrent(
  github: PagesCatalogGitHubProvider,
  request: PagesCatalogPublicationRecord,
  cardId: string
): Promise<"current" | "superseded" | "unverified"> {
  const mergeCommitSha = readOptionalSha(request.mergeCommitSha);
  if (mergeCommitSha === undefined) {
    return "unverified";
  }

  const currentMainSha = await github.getBaseBranchHead();
  const [requestCard, currentCard] = await Promise.all([
    github.getCatalogCard(cardId, { ref: mergeCommitSha }),
    github.getCatalogCard(cardId, { ref: currentMainSha })
  ]);

  if (request.action === "delete") {
    if (requestCard !== null) {
      return "unverified";
    }

    return currentCard === null ? "current" : "superseded";
  }

  if (requestCard === null) {
    return "unverified";
  }

  return sameCatalogCardFile(requestCard, currentCard) ? "current" : "superseded";
}

function sameCatalogCardFile(
  left: PagesCatalogCardFile,
  right: PagesCatalogCardFile | null
): boolean {
  return right !== null && left.blobSha === right.blobSha && left.content === right.content;
}

function isRecoverableNoOpMarkerRequest(request: PagesCatalogPublicationRecord): boolean {
  return request.noOp === true &&
    request.state === "marker" &&
    typeof request.branch === "string" &&
    typeof request.requestId === "string" &&
    UUID_RE.test(request.requestId) &&
    request.branch === `catalog/publish/${request.requestId}` &&
    typeof request.requestFingerprint === "string" &&
    /^[a-f0-9]{64}$/i.test(request.requestFingerprint) &&
    isRecoverableNoOpActionPair(request.action, request.lifecycleAction) &&
    typeof request.cardId === "string" &&
    CARD_ID_RE.test(request.cardId) &&
    typeof request.siteId === "string" &&
    UUID_RE.test(request.siteId) &&
    (request.expectedBlobSha === null || typeof request.expectedBlobSha === "string");
}

function isRecoverableNoOpActionPair(
  action: PagesCatalogPublicationAction | undefined,
  lifecycleAction: PagesCatalogPublicationLifecycleAction | undefined
): boolean {
  if (action === "delete") {
    return lifecycleAction === "delete";
  }

  return action === "update" && (lifecycleAction === "publish" || lifecycleAction === "unpublish");
}

async function reconcileNoOpMarkerPublication(
  github: PagesCatalogGitHubProvider,
  request: PagesCatalogPublicationRecord,
  lifecycle: {
    actor?: AuthenticatedPrincipal | undefined;
    lifecycleFinalizer?: PagesCatalogPublicationLifecycleFinalizer | undefined;
    now?: Date | undefined;
  }
): Promise<PagesCatalogPublicationDto> {
  const action = readAction(request.action);
  const cardId = readCardId(request.cardId);
  const requestId = readRequestId(request.requestId);
  const lifecycleAction = request.lifecycleAction ?? lifecycleActionForPublication(action);
  const currentMainSha = await github.getBaseBranchHead();
  const currentCard = await github.getCatalogCard(cardId, { ref: currentMainSha });
  const expectedBlobSha = request.expectedBlobSha ?? null;
  const currentStateMatches = expectedBlobSha === null
    ? currentCard === null
    : currentCard?.blobSha === expectedBlobSha;

  if (!currentStateMatches) {
    await deleteTemporaryBranchBestEffort(github, request.branch!);
    return publicationDto({
      action,
      cardId,
      code: "PUBLICATION_SUPERSEDED",
      noOp: true,
      requestId,
      retryable: false,
      status: "superseded"
    });
  }

  const pages = github.getCurrentPagesDeploymentStatus === undefined
    ? { status: "pending" as const }
    : await github.getCurrentPagesDeploymentStatus();
  if (pages.status !== "success") {
    return publicationDto({
      action,
      cardId,
      code: pages.status === "failure" ? "PAGES_DEPLOYMENT_FAILED" : "PAGES_DEPLOYMENT_NOT_VERIFIED",
      noOp: true,
      requestId,
      retryable: pages.status !== "failure",
      status: pages.status === "failure" ? "failed" : "deploying"
    });
  }

  const finalized = await finalizePublicationLifecycle({
    action,
    actor: lifecycle.actor,
    cardId,
    lifecycleFinalizer: lifecycle.lifecycleFinalizer,
    lifecycleAction,
    noOp: true,
    now: lifecycle.now,
    requestId,
    siteId: request.siteId
  });
  if (finalized !== null) {
    return finalized;
  }

  await deleteTemporaryBranchBestEffort(github, request.branch!);
  return publicationDto({
    action,
    cardId,
    noOp: true,
    requestId,
    status: "published"
  });
}

async function finalizePublicationLifecycle(input: {
  action: PagesCatalogPublicationAction;
  actor?: AuthenticatedPrincipal | undefined;
  cardId: string;
  lifecycleFinalizer?: PagesCatalogPublicationLifecycleFinalizer | undefined;
  lifecycleAction?: PagesCatalogPublicationLifecycleAction | undefined;
  now?: Date | undefined;
  noOp?: boolean | undefined;
  requestId: string;
  siteId?: string | undefined;
}): Promise<PagesCatalogPublicationDto | null> {
  if (
    input.lifecycleFinalizer === undefined ||
    input.actor === undefined ||
    input.now === undefined ||
    input.siteId === undefined
  ) {
    return publicationDto({
      action: input.action,
      cardId: input.cardId,
      code: "BACKEND_LIFECYCLE_FINALIZATION_FAILED",
      noOp: input.noOp ?? false,
      requestId: input.requestId,
      retryable: true,
      status: "failed"
    });
  }

  try {
    await input.lifecycleFinalizer.finalize({
      actor: input.actor,
      cardId: input.cardId,
      lifecycleAction: input.lifecycleAction ?? lifecycleActionForPublication(input.action),
      now: input.now,
      requestId: input.requestId,
      siteId: input.siteId
    });
    return null;
  } catch {
    return publicationDto({
      action: input.action,
      cardId: input.cardId,
      code: "BACKEND_LIFECYCLE_FINALIZATION_FAILED",
      noOp: false,
      requestId: input.requestId,
      retryable: true,
      status: "failed"
    });
  }
}

function lifecycleActionForPublication(action: PagesCatalogPublicationAction): PagesCatalogPublicationLifecycleAction {
  if (action === "delete") {
    return "delete";
  }

  return "publish";
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

function isRecoverablePublicationRequest(request: PagesCatalogPublicationRecord): boolean {
  return typeof request.branch === "string" &&
    typeof request.requestId === "string" &&
    UUID_RE.test(request.requestId) &&
    request.branch === `catalog/publish/${request.requestId}` &&
    typeof request.requestFingerprint === "string" &&
    /^[a-f0-9]{64}$/i.test(request.requestFingerprint) &&
    request.state === "merged" &&
    request.pagesStatus === "success" &&
    isRecoverableActionPair(request.action, request.lifecycleAction) &&
    typeof request.cardId === "string" &&
    CARD_ID_RE.test(request.cardId) &&
    typeof request.siteId === "string" &&
    UUID_RE.test(request.siteId);
}

function isRecoverableActionPair(
  action: PagesCatalogPublicationAction | undefined,
  lifecycleAction: PagesCatalogPublicationLifecycleAction | undefined
): boolean {
  if (action === "delete") {
    return lifecycleAction === "delete";
  }
  if (action === "create") {
    return lifecycleAction === "publish";
  }
  if (action === "update") {
    return lifecycleAction === "publish" || lifecycleAction === "unpublish";
  }

  return false;
}

function normalizeReconciliationLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 10;
  }

  return Math.max(1, Math.min(20, Math.trunc(value)));
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
    case "superseded":
      return { buttonLabel: "Состояние обновлено", stableStatus: "Состояние обновлено" };
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
  lifecycleAction: PagesCatalogPublicationLifecycleAction;
  noOp: boolean;
  requestFingerprint: string;
  requestId: string;
  siteId?: string | undefined;
}): string {
  return [
    "WEB00 Direct Pages catalog publication.",
    "",
    `WEB00-REQUEST-ID: ${input.requestId}`,
    `WEB00-CARD-ID: ${input.cardId}`,
    `WEB00-ACTION: ${input.action}`,
    `WEB00-LIFECYCLE-ACTION: ${input.lifecycleAction}`,
    `WEB00-NO-OP: ${input.noOp ? "true" : "false"}`,
    `WEB00-EXPECTED-BLOB-SHA: ${input.expectedBlobSha ?? "null"}`,
    `WEB00-FINGERPRINT: ${input.requestFingerprint}`,
    ...(input.siteId === undefined ? [] : [`WEB00-SITE-ID: ${input.siteId}`])
  ].join("\n");
}

function renderCommitMessage(input: {
  action: PagesCatalogPublicationAction;
  cardId: string;
  expectedBlobSha: string | null;
  lifecycleAction: PagesCatalogPublicationLifecycleAction;
  noOp: boolean;
  requestFingerprint: string;
  requestId: string;
  siteId?: string | undefined;
}): string {
  return [
    `catalog: ${input.action} ${input.cardId}`,
    "",
    `WEB00-REQUEST-ID: ${input.requestId}`,
    `WEB00-CARD-ID: ${input.cardId}`,
    `WEB00-ACTION: ${input.action}`,
    `WEB00-LIFECYCLE-ACTION: ${input.lifecycleAction}`,
    `WEB00-NO-OP: ${input.noOp ? "true" : "false"}`,
    `WEB00-EXPECTED-BLOB-SHA: ${input.expectedBlobSha ?? "null"}`,
    `WEB00-FINGERPRINT: ${input.requestFingerprint}`,
    ...(input.siteId === undefined ? [] : [`WEB00-SITE-ID: ${input.siteId}`])
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
  return serializeCanonicalCatalogCard(card);
}

export function serializeCanonicalCatalogCard(card: Record<string, unknown>): string {
  const fileId = canonicalText(card.id);
  const normalized = normalizeCanonicalCatalogCard(card, {
    fileId,
    filePath: fileId ? `catalog/cards/${fileId}.json` : "catalog/cards/<unknown>.json"
  });

  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function normalizeCanonicalCatalogCard(input: Record<string, unknown>, context: { fileId: string; filePath: string }): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Catalog card must be a JSON object: ${context.filePath}`);
  }

  const id = canonicalText(input.id);
  const slug = canonicalText(input.slug || input.id);
  if (!CARD_ID_RE.test(id)) {
    throw new Error(`Invalid catalog card id in ${context.filePath}.`);
  }
  if (id !== context.fileId) {
    throw new Error(`Catalog card id must match filename in ${context.filePath}.`);
  }
  if (!CARD_ID_RE.test(slug)) {
    throw new Error(`Invalid catalog card slug in ${context.filePath}.`);
  }

  const normalized = canonicalOrderedObject({
    id,
    slug,
    sortOrder: canonicalFiniteNumber(input.sortOrder, Number.MAX_SAFE_INTEGER),
    legacyTitle: canonicalOptionalText(input.legacyTitle),
    title: canonicalRequiredText(input.title, "title", context),
    editableTitle: input.editableTitle === true,
    category: canonicalRequiredText(input.category, "category", context),
    description: canonicalRequiredText(input.description, "description", context),
    priceFrom: canonicalOptionalText(input.priceFrom || input.price),
    deliveryTime: canonicalOptionalText(input.deliveryTime || input.delivery),
    features: normalizeCanonicalTextArray(input.features || input.includes, "features", context),
    tags: normalizeCanonicalTextArray(input.tags, "tags", context),
    previewImage: validateCanonicalUrl(input.previewImage, { field: "previewImage", context, required: true }),
    previewType: canonicalOptionalText(input.previewType),
    filter: canonicalOptionalText(input.filter),
    demoMode: canonicalOptionalText(input.demoMode),
    demoLocalUrl: validateNullableCanonicalUrl(input.demoLocalUrl, { field: "demoLocalUrl", context, allowRelative: true }),
    externalDemoUrl: validateNullableCanonicalUrl(input.externalDemoUrl, { field: "externalDemoUrl", context, allowRelative: false }),
    originalDemoUrl: validateNullableCanonicalUrl(input.originalDemoUrl, { field: "originalDemoUrl", context, allowRelative: false }),
    demoUrl: validateNullableCanonicalUrl(input.demoUrl, { field: "demoUrl", context, allowRelative: true }),
    siteUrl: validateNullableCanonicalUrl(input.siteUrl, { field: "siteUrl", context, allowRelative: false }),
    galleryImages: normalizeCanonicalGallery(input.galleryImages, context),
    aliases: normalizeCanonicalAliases(input.aliases, id),
    active: input.active !== false
  }) as { galleryImages: string[]; previewImage: string } & Record<string, unknown>;

  if (normalized.galleryImages.length === 0) {
    normalized.galleryImages = [normalized.previewImage];
  }
  return normalized;
}

function normalizeCanonicalGallery(value: unknown, context: { filePath: string }): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => validateCanonicalUrl(entry, {
    field: `galleryImages[${index}]`,
    context,
    required: true
  }));
}

function normalizeCanonicalAliases(value: unknown, id: string): string[] {
  return [...new Set([
    id,
    ...normalizeCanonicalTextArray(value, "aliases", { filePath: id })
  ].filter(Boolean))];
}

function normalizeCanonicalTextArray(value: unknown, field: string, context: { filePath: string }): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Catalog card ${field} must be an array in ${context.filePath}.`);
  }
  return [...new Set(value.map((item) => canonicalText(item)).filter(Boolean))];
}

function validateNullableCanonicalUrl(
  value: unknown,
  options: { allowRelative: boolean; context: { filePath: string }; field: string }
): string | null {
  if (value === undefined || value === null || value === "") {
    return value === null ? null : "";
  }
  return validateCanonicalUrl(value, { ...options, required: false });
}

function validateCanonicalUrl(
  value: unknown,
  options: { allowRelative?: boolean; context: { filePath: string }; field: string; required: boolean }
): string {
  const raw = canonicalText(value);
  if (!raw) {
    if (options.required) {
      throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
    }
    return "";
  }

  const decodedRaw = repeatedlyDecode(raw);
  if (/[\u0000-\u001f\u007f]/.test(raw) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decodedRaw)) {
    throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
    }
    const decodedPath = repeatedlyDecode(parsed.pathname);
    const hostname = parsed.hostname.replace(/\.+$/, "");
    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      hostname.endsWith(".invalid") ||
      decodedPath.split("/").includes("..")
    ) {
      throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
    }
    return parsed.href;
  }
  if (
    options.allowRelative === false ||
    raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    !RELATIVE_CATALOG_URL_RE.test(raw)
  ) {
    throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
  }
  const decoded = repeatedlyDecode(raw);
  const pathPart = decoded.split(/[/?#]/)[0] ?? "";
  const segments = pathPart.split("/");
  if (segments.includes("..") || decoded.includes("../") || decoded.includes("..\\")) {
    throw new Error(`Invalid catalog card URL ${options.field} in ${options.context.filePath}.`);
  }
  return raw;
}

function canonicalOrderedObject(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function canonicalFiniteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function canonicalRequiredText(value: unknown, field: string, context: { filePath: string }): string {
  const result = canonicalText(value);
  if (!result) {
    throw new Error(`Catalog card ${field} is required in ${context.filePath}.`);
  }
  return result;
}

function canonicalOptionalText(value: unknown): string | undefined {
  const result = canonicalText(value);
  return result || undefined;
}

function canonicalText(value: unknown): string {
  return String(value ?? "").trim();
}

function assertStartInput(input: PagesCatalogPublicationStartInput): void {
  assertRequestId(input.requestId);
  assertCardId(input.cardId);
  if (input.action !== "create" && input.action !== "update" && input.action !== "delete") {
    throw validationError("action", "Unsupported publication action.");
  }
  if (input.lifecycleAction !== "publish" && input.lifecycleAction !== "unpublish" && input.lifecycleAction !== "delete") {
    throw validationError("lifecycleAction", "Unsupported publication lifecycle action.");
  }
  if (input.action !== "create" && input.expectedBlobSha !== null && !/^[a-zA-Z0-9_-]+$/.test(input.expectedBlobSha)) {
    throw validationError("expectedBlobSha", "Invalid expected blob SHA.");
  }
  assertLifecycleActionContract(input);
}

function assertLifecycleActionContract(input: PagesCatalogPublicationStartInput): void {
  if (input.action === "delete") {
    if (input.lifecycleAction !== "delete" || input.card !== null) {
      throw validationError("lifecycleAction", "Delete publication must use delete lifecycle action.");
    }
    return;
  }

  if (input.action === "create") {
    if (input.lifecycleAction !== "publish" || input.card === null || input.card.active === false) {
      throw validationError("lifecycleAction", "Create publication must publish an active catalog card.");
    }
    return;
  }

  if (input.lifecycleAction === "publish") {
    if (input.card === null || input.card.active === false) {
      throw validationError("lifecycleAction", "Publish lifecycle requires an active catalog card.");
    }
    return;
  }

  if (input.lifecycleAction === "unpublish") {
    if (input.card !== null && input.card.active !== false) {
      throw validationError("lifecycleAction", "Unpublish lifecycle requires an inactive card or missing-card no-op.");
    }
    return;
  }

  throw validationError("lifecycleAction", "Update publication cannot use delete lifecycle action.");
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

function assertCardMedia(
  card: Record<string, unknown> | null,
  allowedMediaOrigin: string | null,
  current: PagesCatalogCardFile | null,
  cardId: string
): void {
  if (card === null) {
    return;
  }

  const preservedRelativeMedia = readPreservedRelativeMedia(current, cardId);

  assertMediaUrl(card.previewImage, "card.previewImage", allowedMediaOrigin, preservedRelativeMedia);
  if (Array.isArray(card.galleryImages)) {
    card.galleryImages.forEach((url, index) => {
      assertMediaUrl(url, `card.galleryImages.${index}`, allowedMediaOrigin, preservedRelativeMedia);
    });
  }
}

function assertMediaUrl(
  value: unknown,
  path: string,
  allowedMediaOrigin: string | null,
  preservedRelativeMedia: Set<string>
): void {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    throw validationError(path, "Catalog media URL is required.");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    assertAbsoluteMediaUrl(text, path, allowedMediaOrigin);
    return;
  }

  assertRelativeMediaUrl(text, path, preservedRelativeMedia);
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
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.hostname.replace(/\.+$/, "").endsWith(".invalid") ||
    !parsed.pathname.startsWith("/storage/v1/object/public/web00-catalog-images/") ||
    repeatedlyDecode(parsed.pathname).split("/").includes("..")
  ) {
    throw validationError(path, "Catalog media URL must use the configured public image bucket.");
  }
}

function assertRelativeMediaUrl(value: string, path: string, preservedRelativeMedia: Set<string>): void {
  const decoded = repeatedlyDecode(value);

  if (
    !preservedRelativeMedia.has(value) ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decoded) ||
    !/^[a-z0-9][a-z0-9/_.,+@%=-]*$/i.test(value)
  ) {
    throw validationError(path, "Catalog media URL is invalid.");
  }
}

function readPreservedRelativeMedia(current: PagesCatalogCardFile | null, cardId: string): Set<string> {
  const values = new Set<string>();
  if (current === null || !LEGACY_RELATIVE_MEDIA_CARD_IDS.has(cardId)) {
    return values;
  }

  try {
    const card = JSON.parse(current.content) as { galleryImages?: unknown; previewImage?: unknown };
    collectRelativeMedia(values, card.previewImage);
    if (Array.isArray(card.galleryImages)) {
      for (const image of card.galleryImages) {
        collectRelativeMedia(values, image);
      }
    }
  } catch {
    return values;
  }

  return values;
}

function collectRelativeMedia(values: Set<string>, value: unknown): void {
  const text = String(value ?? "").trim();
  if (text.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    values.add(text);
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

function readRequestId(requestId: unknown): string {
  return typeof requestId === "string" && UUID_RE.test(requestId) ? requestId : "00000000-0000-4000-8000-000000000000";
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
