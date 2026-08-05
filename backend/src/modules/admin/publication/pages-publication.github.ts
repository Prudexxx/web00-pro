import { Buffer } from "node:buffer";
import type {
  PagesCatalogGitHubProvider,
  PagesCatalogPublicationAction,
  PagesCatalogPublicationRecord,
  PagesCatalogRequiredCheckStatus
} from "./pages-publication.service.js";

export interface PagesCatalogGitHubEnv {
  WEB00_GITHUB_BASE_BRANCH?: string;
  WEB00_GITHUB_OWNER?: string;
  WEB00_GITHUB_PAGES_WORKFLOW?: string;
  WEB00_GITHUB_REPO?: string;
  WEB00_GITHUB_REQUIRED_CHECK?: string;
  WEB00_GITHUB_TOKEN?: string;
}

export interface PagesCatalogGitHubConfig {
  baseBranch: string;
  owner: string;
  pagesWorkflow: string;
  repo: string;
  requiredCheck: string;
  token: string;
}

type FetchLike = typeof fetch;

const GITHUB_API = "https://api.github.com";

export function createGitHubPagesCatalogProviderFromEnv(
  env: PagesCatalogGitHubEnv,
  options: { fetchFn?: FetchLike } = {}
): PagesCatalogGitHubProvider {
  const config = readGitHubPagesCatalogConfig(env);
  if (config === null) {
    return createUnavailableGitHubPagesCatalogProvider();
  }

  return createGitHubPagesCatalogProvider({
    config,
    fetchFn: options.fetchFn ?? fetch
  });
}

export function readGitHubPagesCatalogConfig(env: PagesCatalogGitHubEnv): PagesCatalogGitHubConfig | null {
  const token = text(env.WEB00_GITHUB_TOKEN);
  const owner = text(env.WEB00_GITHUB_OWNER);
  const repo = text(env.WEB00_GITHUB_REPO);
  const baseBranch = text(env.WEB00_GITHUB_BASE_BRANCH);
  const requiredCheck = text(env.WEB00_GITHUB_REQUIRED_CHECK);
  const pagesWorkflow = text(env.WEB00_GITHUB_PAGES_WORKFLOW);

  if (!token || !owner || !repo || !baseBranch || !requiredCheck || !pagesWorkflow) {
    return null;
  }

  return {
    baseBranch,
    owner,
    pagesWorkflow,
    repo,
    requiredCheck,
    token
  };
}

export function createGitHubPagesCatalogProvider(options: {
  config: PagesCatalogGitHubConfig;
  fetchFn: FetchLike;
}): PagesCatalogGitHubProvider {
  const client = createGitHubClient(options);

  return {
    async createBranch(input) {
      await client.request(`/git/refs`, {
        body: JSON.stringify({
          ref: `refs/heads/${input.branch}`,
          sha: input.fromSha
        }),
        method: "POST"
      });
    },

    async createCatalogPullRequest(input) {
      const response = await client.request(`/pulls`, {
        body: JSON.stringify({
          base: options.config.baseBranch,
          body: input.body,
          head: input.branch,
          maintainer_can_modify: false,
          title: input.title
        }),
        method: "POST"
      }) as {
        html_url?: unknown;
        node_id?: unknown;
        number?: unknown;
      };

      return {
        nodeId: requireString(response.node_id, "node_id"),
        number: requireNumber(response.number, "number"),
        url: requireString(response.html_url, "html_url")
      };
    },

    async createOrUpdateCardCommit(input) {
      const response = await client.request(`/contents/${encodeURIComponentPath(input.path)}`, {
        body: JSON.stringify({
          branch: input.branch,
          content: Buffer.from(input.content, "utf8").toString("base64"),
          message: input.message,
          ...(input.expectedBlobSha === null ? {} : { sha: input.expectedBlobSha })
        }),
        method: "PUT"
      }) as { commit?: { sha?: unknown } };

      return {
        commitSha: requireString(response.commit?.sha, "commit.sha")
      };
    },

    async deleteCardCommit(input) {
      const response = await client.request(`/contents/${encodeURIComponentPath(input.path)}`, {
        body: JSON.stringify({
          branch: input.branch,
          message: input.message,
          sha: input.expectedBlobSha
        }),
        method: "DELETE"
      }) as { commit?: { sha?: unknown } };

      return {
        commitSha: requireString(response.commit?.sha, "commit.sha")
      };
    },

    async deleteTemporaryBranch(input) {
      await client.deleteOptional(`/git/refs/heads/${encodeURIComponentPath(input.branch)}`);
    },

    async enableAutoMerge(input) {
      await graphQlRequest(options, `
        mutation EnableCatalogAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
          enablePullRequestAutoMerge(input: {
            mergeMethod: $mergeMethod,
            pullRequestId: $pullRequestId
          }) {
            pullRequest { id }
          }
        }
      `, {
        mergeMethod: input.mergeMethod,
        pullRequestId: input.pullRequestNodeId
      });
    },

    async findPublicationRequest(requestId) {
      const branch = `catalog/publish/${requestId}`;
      const pulls = await client.request(`/pulls?state=all&head=${encodeURIComponent(`${options.config.owner}:${branch}`)}&base=${encodeURIComponent(options.config.baseBranch)}`) as unknown[];
      const pull = pulls.find((item) => isMarkedPullRequest(item, requestId));
      if (pull === undefined) {
        return null;
      }

      return mapPullRequestToPublicationRecord(pull, requestId, options.config.pagesWorkflow, client);
    },

    async getBaseBranchHead() {
      const response = await client.request(`/git/ref/heads/${encodeURIComponentPath(options.config.baseBranch)}`) as {
        object?: { sha?: unknown };
      };

      return requireString(response.object?.sha, "object.sha");
    },

    async getCatalogCard(cardId) {
      const response = await client.requestOptional(`/contents/${encodeURIComponentPath(`catalog/cards/${cardId}.json`)}?ref=${encodeURIComponent(options.config.baseBranch)}`);
      if (response === null) {
        return null;
      }
      const file = response as { content?: unknown; encoding?: unknown; sha?: unknown; type?: unknown };
      if (file.type !== "file" || file.encoding !== "base64") {
        return null;
      }

      return {
        blobSha: requireString(file.sha, "sha"),
        content: Buffer.from(requireString(file.content, "content").replace(/\s/g, ""), "base64").toString("utf8")
      };
    },

    async getRepositorySetup() {
      return { configured: true };
    },

    async getRequiredCatalogCheckStatus(request) {
      const required = await readRequiredStatusChecks(client, options.config.baseBranch, options.config.requiredCheck);
      if (!required) {
        return {
          configured: false,
          status: "failure"
        };
      }

      const checkStatus = await readPullRequestCheckStatus(client, request, options.config.requiredCheck);
      return {
        configured: true,
        status: checkStatus
      };
    }
  };
}

function createUnavailableGitHubPagesCatalogProvider(): PagesCatalogGitHubProvider {
  const setup = async () => ({
    code: "GITHUB_REPOSITORY_SETUP_REQUIRED" as const,
    configured: false
  });
  const unavailable = async (): Promise<never> => {
    throw new Error("GitHub Pages publication is not configured.");
  };

  return {
    createBranch: unavailable,
    createCatalogPullRequest: unavailable,
    createOrUpdateCardCommit: unavailable,
    deleteCardCommit: unavailable,
    enableAutoMerge: unavailable,
    findPublicationRequest: async () => null,
    getBaseBranchHead: unavailable,
    getCatalogCard: unavailable,
    getRepositorySetup: setup,
    getRequiredCatalogCheckStatus: async () => ({
      configured: false,
      status: "failure"
    })
  };
}

function createGitHubClient(options: {
  config: PagesCatalogGitHubConfig;
  fetchFn: FetchLike;
}) {
  return {
    async request(path: string, init: RequestInit = {}): Promise<unknown> {
      const response = await options.fetchFn(`${GITHUB_API}/repos/${options.config.owner}/${options.config.repo}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.config.token}`,
          "Content-Type": "application/json",
          "User-Agent": "WEB00-Direct-Pages-Publisher",
          "X-GitHub-Api-Version": "2022-11-28",
          ...init.headers
        }
      });
      if (!response.ok) {
        throw new Error(`GitHub request failed with status ${response.status}.`);
      }

      return response.status === 204 ? {} : response.json();
    },

    async requestOptional(path: string): Promise<unknown | null> {
      const response = await options.fetchFn(`${GITHUB_API}/repos/${options.config.owner}/${options.config.repo}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.config.token}`,
          "User-Agent": "WEB00-Direct-Pages-Publisher",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`GitHub request failed with status ${response.status}.`);
      }

      return response.json();
    },

    async deleteOptional(path: string): Promise<void> {
      const response = await options.fetchFn(`${GITHUB_API}/repos/${options.config.owner}/${options.config.repo}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.config.token}`,
          "User-Agent": "WEB00-Direct-Pages-Publisher",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        method: "DELETE"
      });
      if (response.status === 404 || response.status === 422) {
        return;
      }
      if (!response.ok) {
        throw new Error(`GitHub request failed with status ${response.status}.`);
      }
    }
  };
}

async function graphQlRequest(
  options: { config: PagesCatalogGitHubConfig; fetchFn: FetchLike },
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const response = await options.fetchFn(`${GITHUB_API}/graphql`, {
    body: JSON.stringify({ query, variables }),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.config.token}`,
      "Content-Type": "application/json",
      "User-Agent": "WEB00-Direct-Pages-Publisher",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with status ${response.status}.`);
  }
  const payload = await response.json() as { errors?: unknown[] };
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error("GitHub GraphQL request failed.");
  }

  return payload;
}

async function readRequiredStatusChecks(
  client: ReturnType<typeof createGitHubClient>,
  baseBranch: string,
  requiredCheck: string
): Promise<boolean> {
  const protection = await client.requestOptional(`/branches/${encodeURIComponentPath(baseBranch)}/protection/required_status_checks`);
  if (protection === null) {
    return false;
  }
  const contexts = (protection as { contexts?: unknown }).contexts;
  const checks = (protection as { checks?: unknown }).checks;

  return (
    (Array.isArray(contexts) && contexts.includes(requiredCheck)) ||
    (Array.isArray(checks) && checks.some((check) => (
      typeof check === "object" &&
      check !== null &&
      (check as { context?: unknown }).context === requiredCheck
    )))
  );
}

async function readPullRequestCheckStatus(
  client: ReturnType<typeof createGitHubClient>,
  request: PagesCatalogPublicationRecord,
  requiredCheck: string
): Promise<PagesCatalogRequiredCheckStatus["status"]> {
  const ref = typeof request.branch === "string" ? request.branch : "";
  if (!ref) {
    return "pending";
  }
  const runs = await client.requestOptional(`/commits/${encodeURIComponentPath(ref)}/check-runs`);
  if (runs === null) {
    return "pending";
  }
  const checkRuns = (runs as { check_runs?: unknown }).check_runs;
  if (!Array.isArray(checkRuns)) {
    return "pending";
  }
  const run = checkRuns.find((item) => (
    typeof item === "object" &&
    item !== null &&
    (item as { name?: unknown }).name === requiredCheck
  )) as { conclusion?: unknown; status?: unknown } | undefined;
  if (run === undefined || run.status !== "completed") {
    return "pending";
  }

  return run.conclusion === "success" ? "success" : "failure";
}

async function mapPullRequestToPublicationRecord(
  pull: unknown,
  requestId: string,
  pagesWorkflow: string,
  client: ReturnType<typeof createGitHubClient>
): Promise<PagesCatalogPublicationRecord> {
  const value = pull as {
    auto_merge?: unknown;
    base?: { ref?: unknown };
    body?: unknown;
    head?: { ref?: unknown; sha?: unknown };
    html_url?: unknown;
    merge_commit_sha?: unknown;
    merged_at?: unknown;
    node_id?: unknown;
    number?: unknown;
    state?: unknown;
  };
  const markers = readPullRequestMarkers(String(value.body ?? ""));
  const merged = typeof value.merged_at === "string" && value.merged_at.length > 0;
  const mergeCommitSha = typeof value.merge_commit_sha === "string" ? value.merge_commit_sha : null;

  return {
    action: markers.action,
    autoMergeEnabled: value.auto_merge !== null && value.auto_merge !== undefined,
    body: typeof value.body === "string" ? value.body : undefined,
    branch: typeof value.head?.ref === "string" ? value.head.ref : undefined,
    cardId: markers.cardId,
    checkStatus: "pending",
    mergeCommitSha,
    nodeId: requireString(value.node_id, "node_id"),
    number: requireNumber(value.number, "number"),
    pagesStatus: merged && mergeCommitSha !== null
      ? await readPagesWorkflowStatus(client, pagesWorkflow, mergeCommitSha)
      : null,
    prNumber: requireNumber(value.number, "number"),
    pullRequestNodeId: requireString(value.node_id, "node_id"),
    requestId,
    requestFingerprint: markers.requestFingerprint,
    state: merged ? "merged" : value.state === "open" ? "open" : "closed",
    url: typeof value.html_url === "string" ? value.html_url : undefined
  };
}

async function readPagesWorkflowStatus(
  client: ReturnType<typeof createGitHubClient>,
  pagesWorkflow: string,
  mergeCommitSha: string
): Promise<"failure" | "pending" | "success"> {
  const runs = await client.requestOptional(`/actions/workflows/${encodeURIComponentPath(pagesWorkflow)}/runs?head_sha=${encodeURIComponent(mergeCommitSha)}&per_page=10`);
  if (runs === null) {
    return "pending";
  }
  const workflowRuns = (runs as { workflow_runs?: unknown }).workflow_runs;
  if (!Array.isArray(workflowRuns) || workflowRuns.length === 0) {
    return "pending";
  }
  const run = workflowRuns[0] as { conclusion?: unknown; status?: unknown };
  if (run.status !== "completed") {
    return "pending";
  }

  return run.conclusion === "success" ? "success" : "failure";
}

function isMarkedPullRequest(value: unknown, requestId: string): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = (value as { body?: unknown }).body;

  return typeof body === "string" && body.includes(`WEB00-REQUEST-ID: ${requestId}`);
}

function readPullRequestMarkers(body: string): {
  action: PagesCatalogPublicationAction;
  cardId: string;
  requestFingerprint: string;
} {
  const action = marker(body, "WEB00-ACTION");
  const cardId = marker(body, "WEB00-CARD-ID");
  const requestFingerprint = marker(body, "WEB00-FINGERPRINT");

  return {
    action: action === "create" || action === "delete" || action === "update" ? action : "update",
    cardId: cardId || "unknown-card",
    requestFingerprint
  };
}

function marker(body: string, key: string): string {
  const line = body.split(/\r?\n/).find((item) => item.startsWith(`${key}: `));
  return line?.slice(key.length + 2).trim() ?? "";
}

function encodeURIComponentPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub response missing ${field}.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`GitHub response missing ${field}.`);
  }

  return value;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}
