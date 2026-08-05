import { describe, expect, it, vi } from "vitest";

const publicationServiceModulePath = "../src/modules/admin/publication/publication.service.js";

describe("Direct Pages catalog publication service", () => {
  it("CREATE / UPDATE / DELETE mutates exactly one canonical card JSON and returns no-op for identical content", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      github,
      now: fixedNow
    });
    const createdCard = canonicalCard({
      id: "phase-two-created",
      slug: "phase-two-created",
      title: "Phase Two Created"
    });
    const updatedCard = canonicalCard({
      id: "phase-two-existing",
      slug: "phase-two-existing",
      title: "Phase Two Updated"
    });
    const existingBytes = serializeCanonicalCatalogCard(canonicalCard({
      id: "phase-two-existing",
      slug: "phase-two-existing",
      title: "Phase Two Existing"
    }));
    github.setMainCard("phase-two-existing", {
      blobSha: "sha-existing-main",
      content: existingBytes
    });
    github.setMainCard("phase-two-identical", {
      blobSha: "sha-identical-main",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-identical",
        slug: "phase-two-identical",
        title: "Phase Two Identical"
      }))
    });
    github.setMainCard("phase-two-delete", {
      blobSha: "sha-delete-main",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-delete",
        slug: "phase-two-delete",
        title: "Phase Two Delete"
      }))
    });

    const createResult = await service.startPagesPublication(startInput({
      action: "create",
      card: createdCard,
      cardId: "phase-two-created",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000201"
    }));
    const createNoop = await service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-identical",
        slug: "phase-two-identical",
        title: "Phase Two Identical"
      }),
      cardId: "phase-two-identical",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000202"
    }));
    const updateResult = await service.startPagesPublication(startInput({
      action: "update",
      card: updatedCard,
      cardId: "phase-two-existing",
      expectedBlobSha: "sha-existing-main",
      requestId: "00000000-0000-4000-8000-000000000203"
    }));
    const updateNoop = await service.startPagesPublication(startInput({
      action: "update",
      card: canonicalCard({
        id: "phase-two-existing",
        slug: "phase-two-existing",
        title: "Phase Two Existing"
      }),
      cardId: "phase-two-existing",
      expectedBlobSha: "sha-existing-main",
      requestId: "00000000-0000-4000-8000-000000000204"
    }));
    const deleteResult = await service.startPagesPublication(startInput({
      action: "delete",
      card: null,
      cardId: "phase-two-delete",
      expectedBlobSha: "sha-delete-main",
      requestId: "00000000-0000-4000-8000-000000000205"
    }));
    const deleteNoop = await service.startPagesPublication(startInput({
      action: "delete",
      card: null,
      cardId: "phase-two-missing",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000206"
    }));

    expect(createResult).toMatchObject({
      action: "create",
      cardId: "phase-two-created",
      operationId: "00000000-0000-4000-8000-000000000201",
      status: "merge_queued"
    });
    expect(createNoop).toMatchObject({ noOp: true, status: "published" });
    expect(updateResult).toMatchObject({
      action: "update",
      cardId: "phase-two-existing",
      operationId: "00000000-0000-4000-8000-000000000203",
      status: "merge_queued"
    });
    expect(updateNoop).toMatchObject({ noOp: true, status: "published" });
    expect(deleteResult).toMatchObject({
      action: "delete",
      cardId: "phase-two-delete",
      operationId: "00000000-0000-4000-8000-000000000205",
      status: "merge_queued"
    });
    expect(deleteNoop).toMatchObject({ noOp: true, status: "published" });
    expect(github.commits).toEqual([
      expect.objectContaining({
        branch: "catalog/publish/00000000-0000-4000-8000-000000000201",
        content: serializeCanonicalCatalogCard(createdCard),
        expectedBlobSha: null,
        path: "catalog/cards/phase-two-created.json"
      }),
      expect.objectContaining({
        branch: "catalog/publish/00000000-0000-4000-8000-000000000203",
        content: serializeCanonicalCatalogCard(updatedCard),
        expectedBlobSha: "sha-existing-main",
        path: "catalog/cards/phase-two-existing.json"
      }),
      expect.objectContaining({
        branch: "catalog/publish/00000000-0000-4000-8000-000000000205",
        content: null,
        expectedBlobSha: "sha-delete-main",
        path: "catalog/cards/phase-two-delete.json"
      })
    ]);
    expect(github.createdBranches).toHaveLength(3);
    expect(github.pullRequests.map((pullRequest) => pullRequest.body)).toEqual([
      expect.stringContaining("WEB00-REQUEST-ID: 00000000-0000-4000-8000-000000000201"),
      expect.stringContaining("WEB00-REQUEST-ID: 00000000-0000-4000-8000-000000000203"),
      expect.stringContaining("WEB00-REQUEST-ID: 00000000-0000-4000-8000-000000000205")
    ]);
  });

  it("IDEMPOTENCY replays an existing requestId without creating a second branch, commit or PR", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      github,
      now: fixedNow
    });
    const input = startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-idempotent",
        slug: "phase-two-idempotent",
        title: "Phase Two Idempotent"
      }),
      cardId: "phase-two-idempotent",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000301"
    });

    const first = await service.startPagesPublication(input);
    const replay = await service.startPagesPublication(input);
    const mismatchedReplay = service.startPagesPublication({
      ...input,
      card: canonicalCard({
        id: "phase-two-idempotent-other",
        slug: "phase-two-idempotent-other",
        title: "Phase Two Idempotent Other"
      }),
      cardId: "phase-two-idempotent-other"
    });

    expect(first).toMatchObject({
      operationId: "00000000-0000-4000-8000-000000000301",
      status: "merge_queued"
    });
    expect(replay).toMatchObject({
      operationId: "00000000-0000-4000-8000-000000000301",
      status: "merge_queued"
    });
    await expect(mismatchedReplay).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });
    expect(github.createdBranches).toHaveLength(1);
    expect(github.commits).toHaveLength(1);
    expect(github.pullRequests).toHaveLength(1);
    expect(github.createBranch).toHaveBeenCalledTimes(1);
    expect(github.createOrUpdateCardCommit).toHaveBeenCalledTimes(1);
    expect(github.createCatalogPullRequest).toHaveBeenCalledTimes(1);
  });

  it("CONCURRENCY allows different cards to publish independently and rejects stale expectedBlobSha for the same card", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      github,
      now: fixedNow
    });
    github.setMainCard("phase-two-card-a", {
      blobSha: "sha-card-a-current",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-card-a",
        slug: "phase-two-card-a",
        title: "Card A Original"
      }))
    });
    github.setMainCard("phase-two-card-b", {
      blobSha: "sha-card-b-current",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-card-b",
        slug: "phase-two-card-b",
        title: "Card B Original"
      }))
    });

    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: canonicalCard({
        id: "phase-two-card-a",
        slug: "phase-two-card-a",
        title: "Card A Updated"
      }),
      cardId: "phase-two-card-a",
      expectedBlobSha: "sha-card-a-current",
      requestId: "00000000-0000-4000-8000-000000000401"
    }))).resolves.toMatchObject({
      cardId: "phase-two-card-a",
      status: "merge_queued"
    });
    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: canonicalCard({
        id: "phase-two-card-b",
        slug: "phase-two-card-b",
        title: "Card B Updated"
      }),
      cardId: "phase-two-card-b",
      expectedBlobSha: "sha-card-b-current",
      requestId: "00000000-0000-4000-8000-000000000402"
    }))).resolves.toMatchObject({
      cardId: "phase-two-card-b",
      status: "merge_queued"
    });
    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: canonicalCard({
        id: "phase-two-card-a",
        slug: "phase-two-card-a",
        title: "Card A Stale"
      }),
      cardId: "phase-two-card-a",
      expectedBlobSha: "sha-card-a-stale",
      requestId: "00000000-0000-4000-8000-000000000403"
    }))).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      statusCode: 409
    });
    expect(github.createdBranches.map((branch) => branch.branch)).toEqual([
      "catalog/publish/00000000-0000-4000-8000-000000000401",
      "catalog/publish/00000000-0000-4000-8000-000000000402"
    ]);
    expect(github.commits).toHaveLength(2);
    expect(github.pullRequests).toHaveLength(2);
  });

  it("AUTO-MERGE SAFETY enables squash auto-merge only after the required catalog validation check is successful", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const pendingGithub = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "pending"
    });
    const pendingService = createPagesCatalogPublicationService({
      github: pendingGithub,
      now: fixedNow
    });

    const pending = await pendingService.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-validation-pending",
        slug: "phase-two-validation-pending",
        title: "Phase Two Validation Pending"
      }),
      cardId: "phase-two-validation-pending",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000501"
    }));
    expect(pending).toMatchObject({
      status: "validating",
      statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000501"
    });
    expect(pendingGithub.enableAutoMerge).not.toHaveBeenCalled();

    pendingGithub.setRequiredCheckStatus("success");
    const queued = await pendingService.getPagesPublicationStatus("00000000-0000-4000-8000-000000000501");
    expect(queued).toMatchObject({
      buttonLabel: "Проверяется",
      status: "merge_queued"
    });
    expect(pendingGithub.enableAutoMerge).toHaveBeenCalledWith({
      mergeMethod: "SQUASH",
      pullRequestNodeId: "PR_node_1"
    });
    pendingGithub.setPublicationRequest("00000000-0000-4000-8000-000000000501", {
      mergeCommitSha: "a".repeat(40),
      pagesStatus: "success",
      state: "merged"
    });
    const published = await pendingService.getPagesPublicationStatus("00000000-0000-4000-8000-000000000501");
    expect(published).toMatchObject({
      mergeCommitSha: "a".repeat(40),
      status: "published"
    });
    expect(pendingGithub.deletedBranches).toEqual([
      { branch: "catalog/publish/00000000-0000-4000-8000-000000000501" }
    ]);

    const mismatchGithub = createGitHubProviderFake({
      requiredCheckConfigured: false,
      requiredCheckStatus: "success"
    });
    const mismatchService = createPagesCatalogPublicationService({
      github: mismatchGithub,
      now: fixedNow
    });
    const setup = await mismatchService.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-setup-required",
        slug: "phase-two-setup-required",
        title: "Phase Two Setup Required"
      }),
      cardId: "phase-two-setup-required",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000502"
    }));

    expect(setup).toMatchObject({
      code: "GITHUB_REPOSITORY_SETUP_REQUIRED",
      status: "setup_required"
    });
    expect(mismatchGithub.enableAutoMerge).not.toHaveBeenCalled();
  });
});

async function loadPublicationServiceExports(): Promise<Record<string, any>> {
  const module = await import(publicationServiceModulePath) as Record<string, unknown>;
  const createPagesCatalogPublicationService = module.createPagesCatalogPublicationService;

  expect(typeof createPagesCatalogPublicationService).toBe("function");

  return {
    createPagesCatalogPublicationService
  };
}

async function loadPagesCatalogGenerator(): Promise<{
  serializeCanonicalCatalogCard(card: Record<string, unknown>): string;
}> {
  const modulePath = `../../scripts/build-pages-catalog.mjs?test=${Date.now()}-${Math.random()}`;
  const module = await import(modulePath) as Record<string, unknown>;
  const serializeCanonicalCatalogCard = module.serializeCanonicalCatalogCard;

  expect(typeof serializeCanonicalCatalogCard).toBe("function");

  return {
    serializeCanonicalCatalogCard: serializeCanonicalCatalogCard as (card: Record<string, unknown>) => string
  };
}

function createGitHubProviderFake(options: {
  requiredCheckConfigured: boolean;
  requiredCheckStatus: "failure" | "pending" | "success";
}) {
  let requiredCheckStatus = options.requiredCheckStatus;
  const mainCards = new Map<string, { blobSha: string; content: string }>();
  const requests = new Map<string, Record<string, unknown>>();
  const github = {
    autoMergeRequests: [] as Record<string, unknown>[],
    commits: [] as Record<string, unknown>[],
    createdBranches: [] as Record<string, unknown>[],
    deletedBranches: [] as Record<string, unknown>[],
    pullRequests: [] as Record<string, unknown>[],
    createBranch: vi.fn(async (input: Record<string, unknown>) => {
      github.createdBranches.push(input);
    }),
    createCatalogPullRequest: vi.fn(async (input: Record<string, unknown>) => {
      const pullRequest = {
        ...input,
        nodeId: `PR_node_${github.pullRequests.length + 1}`,
        number: github.pullRequests.length + 1,
        url: `https://github.example.test/pull/${github.pullRequests.length + 1}`
      };
      github.pullRequests.push(pullRequest);
      requests.set(String(input.requestId), {
        ...pullRequest,
        autoMergeEnabled: false,
        checkStatus: requiredCheckStatus,
        mergeCommitSha: null,
        pagesStatus: null,
        state: "open"
      });

      return pullRequest;
    }),
    createOrUpdateCardCommit: vi.fn(async (input: Record<string, unknown>) => {
      github.commits.push(input);
      return { commitSha: `commit_${github.commits.length}` };
    }),
    deleteCardCommit: vi.fn(async (input: Record<string, unknown>) => {
      github.commits.push({ ...input, content: null });
      return { commitSha: `commit_${github.commits.length}` };
    }),
    deleteTemporaryBranch: vi.fn(async (input: Record<string, unknown>) => {
      github.deletedBranches.push(input);
    }),
    enableAutoMerge: vi.fn(async (input: Record<string, unknown>) => {
      github.autoMergeRequests.push(input);
    }),
    findPublicationRequest: vi.fn(async (requestId: string) => requests.get(requestId) ?? null),
    getBaseBranchHead: vi.fn(async () => "main-sha"),
    getCatalogCard: vi.fn(async (cardId: string) => mainCards.get(cardId) ?? null),
    getRequiredCatalogCheckStatus: vi.fn(async () => ({
      configured: options.requiredCheckConfigured,
      status: requiredCheckStatus
    })),
    setRequiredCheckStatus(status: "failure" | "pending" | "success") {
      requiredCheckStatus = status;
      for (const request of requests.values()) {
        request.checkStatus = status;
      }
    },
    setPublicationRequest(requestId: string, patch: Record<string, unknown>) {
      const request = requests.get(requestId);
      if (request === undefined) {
        throw new Error(`Missing synthetic publication request ${requestId}.`);
      }
      requests.set(requestId, {
        ...request,
        ...patch
      });
    },
    setMainCard(cardId: string, value: { blobSha: string; content: string }) {
      mainCards.set(cardId, value);
    }
  };

  return github;
}

function startInput(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    actor: {
      email: "admin@example.test",
      id: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      sessionId: "00000000-0000-4000-8000-000000000002",
      tokenId: "00000000-0000-4000-8000-000000000003"
    },
    now: fixedNow(),
    ...overrides
  };
}

function canonicalCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    active: true,
    aliases: [String(overrides.id ?? "phase-two-card")],
    category: "Synthetic Category",
    deliveryTime: "от 3 дней",
    demoLocalUrl: null,
    demoMode: "external-iframe",
    demoUrl: "https://example.com/demo",
    description: "Synthetic direct Pages card.",
    editableTitle: true,
    externalDemoUrl: "https://example.com/demo",
    features: ["Feature A", "Feature B"],
    filter: "synthetic",
    galleryImages: [
      "assets/img/solution-gallery/synthetic-a.png",
      "assets/img/solution-gallery/synthetic-b.png"
    ],
    id: "phase-two-card",
    legacyTitle: "Phase Two Card",
    originalDemoUrl: "https://example.com/demo",
    previewImage: "assets/img/previews/synthetic.png",
    previewType: "services",
    priceFrom: "от 100 000 ₽",
    siteUrl: "https://example.com",
    slug: "phase-two-card",
    sortOrder: 1000,
    tags: ["synthetic"],
    title: "Phase Two Card",
    ...overrides
  };
}

function fixedNow(): Date {
  return new Date("2026-08-05T12:00:00.000Z");
}
