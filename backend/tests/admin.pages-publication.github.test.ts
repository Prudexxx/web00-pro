import { describe, expect, it } from "vitest";

import {
  createGitHubPagesCatalogProvider
} from "../src/modules/admin/publication/pages-publication.github.js";
import type { PagesCatalogPublicationRecord } from "../src/modules/admin/publication/pages-publication.service.js";

const config = {
  baseBranch: "main",
  owner: "Prudexxx",
  pagesWorkflow: "pages.yml",
  repo: "web00-pro",
  requiredCheck: "web00-catalog-validate",
  token: "synthetic-token-for-provider-tests"
};

describe("Direct Pages GitHub provider", () => {
  it("RECOVERY classifies branch-exists, retryable API failure, and timeout without leaking provider payloads", async () => {
    const branchExistsProvider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async () => jsonResponse(422, {
        message: "Reference already exists",
        raw: "Authorization Bearer should-not-leak"
      })
    });

    await expect(branchExistsProvider.createBranch({
      branch: "catalog/publish/00000000-0000-4000-8000-00000000a001",
      fromSha: "a".repeat(40)
    })).rejects.toMatchObject({
      code: "GITHUB_BRANCH_ALREADY_EXISTS",
      statusCode: 409
    });

    const retryableProvider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async () => jsonResponse(503, {
        message: "provider unavailable Authorization Bearer should-not-leak"
      })
    });

    await expect(retryableProvider.getBaseBranchHead()).rejects.toMatchObject({
      code: "GITHUB_API_RETRYABLE",
      statusCode: 503
    });
    await expect(retryableProvider.getBaseBranchHead()).rejects.not.toThrow(/Bearer|should-not-leak|provider unavailable/);

    const timeoutProvider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      }),
      requestTimeoutMs: 1
    } as Parameters<typeof createGitHubPagesCatalogProvider>[0]);

    await expect(timeoutProvider.getBaseBranchHead()).rejects.toMatchObject({
      code: "GITHUB_API_TIMEOUT",
      statusCode: 503
    });
  });

  it("PAGES STATUS accepts the latest successful main deployment that contains the merged mutation", async () => {
    const mergeSha = "a".repeat(40);
    const deployedSha = "b".repeat(40);
    const provider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async (url) => {
        const text = String(url);

        if (text.includes("/pulls?")) {
          return jsonResponse(200, [
            {
              body: [
                "WEB00-REQUEST-ID: 00000000-0000-4000-8000-00000000b001",
                "WEB00-CARD-ID: phase-two-pages-status",
                "WEB00-ACTION: update",
                "WEB00-LIFECYCLE-ACTION: publish",
                `WEB00-FINGERPRINT: ${"c".repeat(64)}`
              ].join("\n"),
              head: { ref: "catalog/publish/00000000-0000-4000-8000-00000000b001" },
              html_url: "https://github.example.test/pull/77",
              merge_commit_sha: mergeSha,
              merged_at: "2026-08-05T12:00:00Z",
              node_id: "PR_node_pages",
              number: 77,
              state: "closed"
            }
          ]);
        }
        if (text.includes(`/actions/workflows/${config.pagesWorkflow}/runs?head_sha=${mergeSha}`)) {
          return jsonResponse(200, { workflow_runs: [] });
        }
        if (text.includes(`/actions/workflows/${config.pagesWorkflow}/runs?branch=main&status=success`)) {
          return jsonResponse(200, {
            workflow_runs: [
              {
                conclusion: "success",
                head_sha: deployedSha,
                status: "completed"
              }
            ]
          });
        }
        if (text.includes(`/compare/${mergeSha}...${deployedSha}`)) {
          return jsonResponse(200, { status: "ahead" });
        }

        throw new Error(`Unexpected GitHub URL ${text}`);
      }
    });

    await expect(provider.findPublicationRequest("00000000-0000-4000-8000-00000000b001")).resolves.toMatchObject({
      mergeCommitSha: mergeSha,
      pagesStatus: "success",
      state: "merged"
    });
  });

  it("RECOVERY ignores catalog publication PRs without an explicit lifecycle marker", async () => {
    const provider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async (url) => {
        const text = String(url);

        if (text.includes("/pulls?")) {
          return jsonResponse(200, [
            {
              body: [
                "WEB00-REQUEST-ID: 00000000-0000-4000-8000-00000000b002",
                "WEB00-CARD-ID: phase-two-missing-lifecycle",
                "WEB00-ACTION: update",
                `WEB00-FINGERPRINT: ${"d".repeat(64)}`
              ].join("\n"),
              head: { ref: "catalog/publish/00000000-0000-4000-8000-00000000b002" },
              html_url: "https://github.example.test/pull/78",
              merge_commit_sha: "a".repeat(40),
              merged_at: "2026-08-05T12:00:00Z",
              node_id: "PR_node_missing_lifecycle",
              number: 78,
              state: "closed"
            }
          ]);
        }

        throw new Error(`Unexpected GitHub URL ${text}`);
      }
    });

    await expect(provider.findPublicationRequest("00000000-0000-4000-8000-00000000b002")).resolves.toBeNull();
    await expect(provider.listRecentPublicationRequests?.({ limit: 5 })).resolves.toEqual([]);
  });

  it("PHASE 2.4 reads the required check from the current PR test-merge SHA before falling back to head SHA", async () => {
    const headSha = "1".repeat(40);
    const testMergeSha = "2".repeat(40);
    const requested: string[] = [];
    const provider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async (url) => {
        const text = String(url);
        requested.push(text);

        if (text.includes("/pulls?")) {
          return jsonResponse(200, [
            {
              body: [
                "WEB00-REQUEST-ID: 00000000-0000-4000-8000-00000000b004",
                "WEB00-CARD-ID: phase-two-test-merge-check",
                "WEB00-ACTION: update",
                "WEB00-LIFECYCLE-ACTION: publish",
                "WEB00-NO-OP: false",
                "WEB00-EXPECTED-BLOB-SHA: previous-blob",
                `WEB00-FINGERPRINT: ${"e".repeat(64)}`
              ].join("\n"),
              head: {
                ref: "catalog/publish/00000000-0000-4000-8000-00000000b004",
                sha: headSha
              },
              html_url: "https://github.example.test/pull/79",
              merge_commit_sha: testMergeSha,
              mergeable_state: "clean",
              merged_at: null,
              node_id: "PR_node_test_merge_check",
              number: 79,
              state: "open"
            }
          ]);
        }
        if (text.includes(`/commits/${testMergeSha}/check-runs`)) {
          return jsonResponse(200, {
            check_runs: [
              {
                conclusion: "success",
                name: config.requiredCheck,
                status: "completed"
              }
            ]
          });
        }
        if (text.includes(`/commits/${headSha}/check-runs`)) {
          throw new Error("Head SHA fallback must not run when the named test-merge check exists.");
        }

        throw new Error(`Unexpected GitHub URL ${text}`);
      }
    });

    const request = await provider.findPublicationRequest("00000000-0000-4000-8000-00000000b004");
    expect(request).toMatchObject({
      headSha,
      testMergeSha
    });
    await expect(provider.getRequiredCatalogCheckStatus(request!)).resolves.toEqual({
      configured: true,
      status: "success"
    });
    expect(requested.some((url) => url.includes(`/commits/${testMergeSha}/check-runs`))).toBe(true);
    expect(requested.some((url) => url.includes(`/commits/${headSha}/check-runs`))).toBe(false);

    const fallbackRequested: string[] = [];
    const fallbackProvider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async (url) => {
        const text = String(url);
        fallbackRequested.push(text);
        if (text.includes("/pulls?")) {
          return jsonResponse(200, [
            {
              body: [
                "WEB00-REQUEST-ID: 00000000-0000-4000-8000-00000000b004",
                "WEB00-CARD-ID: phase-two-test-merge-check",
                "WEB00-ACTION: update",
                "WEB00-LIFECYCLE-ACTION: publish",
                "WEB00-NO-OP: false",
                "WEB00-EXPECTED-BLOB-SHA: previous-blob",
                `WEB00-FINGERPRINT: ${"e".repeat(64)}`
              ].join("\n"),
              head: {
                ref: "catalog/publish/00000000-0000-4000-8000-00000000b004",
                sha: headSha
              },
              html_url: "https://github.example.test/pull/79",
              merge_commit_sha: testMergeSha,
              mergeable_state: "clean",
              merged_at: null,
              node_id: "PR_node_test_merge_check",
              number: 79,
              state: "open"
            }
          ]);
        }
        if (text.includes(`/commits/${testMergeSha}/check-runs`)) {
          return jsonResponse(200, { check_runs: [] });
        }
        if (text.includes(`/commits/${headSha}/check-runs`)) {
          return jsonResponse(200, {
            check_runs: [
              {
                conclusion: "success",
                name: config.requiredCheck,
                status: "completed"
              }
            ]
          });
        }
        throw new Error(`Unexpected GitHub URL ${text}`);
      }
    });
    const fallbackRequest = await fallbackProvider.findPublicationRequest("00000000-0000-4000-8000-00000000b004");
    await expect(fallbackProvider.getRequiredCatalogCheckStatus(fallbackRequest!)).resolves.toEqual({
      configured: true,
      status: "success"
    });
    expect(fallbackRequested.some((url) => url.includes(`/commits/${testMergeSha}/check-runs`))).toBe(true);
    expect(fallbackRequested.some((url) => url.includes(`/commits/${headSha}/check-runs`))).toBe(true);
  });

  it("SELF-MERGE green required check uses one REST squash merge with the exact current head", async () => {
    const headSha = "3".repeat(40);
    const testMergeSha = "4".repeat(40);
    const mergeCommitSha = "5".repeat(40);
    const requested: Array<{ body: unknown; method: string; url: string }> = [];
    const provider = createGitHubPagesCatalogProvider({
      config,
      fetchFn: async (url, init) => {
        const text = String(url);
        requested.push({
          body: init?.body === undefined ? null : JSON.parse(String(init.body)),
          method: init?.method ?? "GET",
          url: text
        });

        if (text.includes(`/commits/${testMergeSha}/check-runs`)) {
          return jsonResponse(200, {
            check_runs: [
              {
                conclusion: "success",
                name: config.requiredCheck,
                status: "completed"
              }
            ]
          });
        }
        if (text.endsWith("/pulls/42/merge") && init?.method === "PUT") {
          return jsonResponse(200, {
            merged: true,
            sha: mergeCommitSha
          });
        }

        throw new Error(`Unexpected GitHub URL ${text}`);
      }
    });
    const request = publicationRecord({
      headSha,
      number: 42,
      testMergeSha
    });

    await expect(provider.getRequiredCatalogCheckStatus(request)).resolves.toEqual({
      configured: true,
      status: "success"
    });
    await expect(provider.mergeCatalogPullRequest({
      headSha,
      number: 42
    })).resolves.toEqual({
      mergeCommitSha
    });

    expect(requested.filter((request) => request.url.endsWith("/pulls/42/merge"))).toEqual([
      {
        body: {
          merge_method: "squash",
          sha: headSha
        },
        method: "PUT",
        url: "https://api.github.com/repos/Prudexxx/web00-pro/pulls/42/merge"
      }
    ]);
    expect(requested.some((request) => request.url.includes("/protection/required_status_checks"))).toBe(false);
  });

  it("SELF-MERGE pending and failed required checks never use branch protection or REST merge", async () => {
    for (const status of ["pending", "failure"] as const) {
      const requested: string[] = [];
      const provider = createGitHubPagesCatalogProvider({
        config,
        fetchFn: async (url) => {
          const text = String(url);
          requested.push(text);

          if (text.includes("/protection/required_status_checks")) {
            throw new Error("Self-merge must not require branch protection admin API.");
          }
          if (text.endsWith("/pulls/43/merge")) {
            throw new Error("Pending or failed catalog checks must not merge.");
          }
          if (text.includes(`/commits/${"6".repeat(40)}/check-runs`)) {
            return jsonResponse(200, {
              check_runs: [
                {
                  conclusion: status === "failure" ? "failure" : null,
                  name: config.requiredCheck,
                  status: status === "failure" ? "completed" : "in_progress"
                }
              ]
            });
          }

          throw new Error(`Unexpected GitHub URL ${text}`);
        }
      });

      await expect(provider.getRequiredCatalogCheckStatus(publicationRecord({
        headSha: "6".repeat(40),
        number: 43
      }))).resolves.toEqual({
        configured: true,
        status
      });
      expect(requested.some((request) => request.endsWith("/pulls/43/merge"))).toBe(false);
    }
  });

});

function publicationRecord(overrides: Partial<PagesCatalogPublicationRecord> = {}): PagesCatalogPublicationRecord {
  return {
    action: "update",
    branch: "catalog/publish/00000000-0000-4000-8000-00000000b005",
    cardId: "phase-two-self-merge",
    headSha: "3".repeat(40),
    lifecycleAction: "publish",
    mergeableState: "clean",
    noOp: false,
    number: 42,
    prNumber: 42,
    requestFingerprint: "f".repeat(64),
    requestId: "00000000-0000-4000-8000-00000000b005",
    state: "open",
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
