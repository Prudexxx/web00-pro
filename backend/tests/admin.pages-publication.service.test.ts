import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const publicationServiceModulePath = "../src/modules/admin/publication/publication.service.js";

describe("Direct Pages catalog publication service", () => {
  it("CREATE / UPDATE / DELETE mutates exactly one canonical card JSON and keeps only version-grounded no-ops", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
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
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-identical",
        slug: "phase-two-identical",
        title: "Phase Two Identical"
      }),
      cardId: "phase-two-identical",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000202"
    }))).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      statusCode: 409
    });
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
    expect(github.createdBranches).toHaveLength(5);
    expect(github.markerCommits).toHaveLength(5);
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
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
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

  it("PHASE 2.2 replay, no-op and orphan branch validate a durable request fingerprint", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      currentPagesStatus: "success",
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
      now: fixedNow
    });
    const noOpCard = canonicalCard({
      id: "phase-two-durable-noop",
      slug: "phase-two-durable-noop",
      title: "Phase Two Durable Noop"
    });
    const noOpInput = startInput({
      action: "update",
      card: noOpCard,
      cardId: "phase-two-durable-noop",
      expectedBlobSha: "sha-durable-noop",
      requestId: "00000000-0000-4000-8000-000000001001"
    });
    github.setMainCard("phase-two-durable-noop", {
      blobSha: "sha-durable-noop",
      content: serializeCanonicalCatalogCard(noOpCard)
    });

    await expect(service.startPagesPublication(noOpInput)).resolves.toMatchObject({
      noOp: true,
      status: "published"
    });
    expect(github.markerCommits).toEqual([
      expect.objectContaining({
        branch: "catalog/publish/00000000-0000-4000-8000-000000001001",
        requestFingerprint: await expectedRequestFingerprint(noOpInput)
      })
    ]);
    await expect(service.startPagesPublication({
      ...noOpInput,
      card: canonicalCard({
        id: "phase-two-durable-noop",
        slug: "phase-two-durable-noop",
        title: "Phase Two Durable Noop Changed"
      })
    })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });

    const orphanWithoutMarkerRequestId = "00000000-0000-4000-8000-000000001003";
    github.setBranchHead(`catalog/publish/${orphanWithoutMarkerRequestId}`, "orphan-without-marker");
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-orphan-without-marker",
        slug: "phase-two-orphan-without-marker",
        title: "Phase Two Orphan Without Marker"
      }),
      cardId: "phase-two-orphan-without-marker",
      expectedBlobSha: null,
      requestId: orphanWithoutMarkerRequestId
    }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });

    const orphanRequestId = "00000000-0000-4000-8000-000000001002";
    const orphanBranch = `catalog/publish/${orphanRequestId}`;
    const orphanInput = startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-orphan",
        slug: "phase-two-orphan",
        title: "Phase Two Orphan"
      }),
      cardId: "phase-two-orphan",
      expectedBlobSha: null,
      requestId: orphanRequestId
    });
    github.setBranchHead(orphanBranch, "orphan-branch-head");
    github.setBranchPublicationRequest(orphanRequestId, {
      action: "create",
      branch: orphanBranch,
      cardId: "phase-two-orphan",
      requestFingerprint: await expectedRequestFingerprint(orphanInput),
      requestId: orphanRequestId
    });

    await expect(service.startPagesPublication({
      ...orphanInput,
      card: canonicalCard({
        id: "phase-two-orphan",
        slug: "phase-two-orphan",
        title: "Phase Two Orphan Different"
      })
    })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });
  });

  it("CONCURRENCY allows different cards to publish independently and rejects stale expectedBlobSha for the same card", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
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

  it("PHASE 2.3 same-card race for create, update, delete and no-op fails with VERSION_CONFLICT before GitHub mutation", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();

    async function expectRaceConflict(input: Record<string, unknown>, setup: (github: ReturnType<typeof createGitHubProviderFake>) => void) {
      const github = createGitHubProviderFake({
        requiredCheckConfigured: true,
        requiredCheckStatus: "success"
      });
      setup(github);
      const service = createPagesCatalogPublicationService({
        allowedMediaOrigin: "https://storage.example.test",
        github,
        lifecycleFinalizer: lifecycleFinalizerFake(),
        now: fixedNow
      });

      await expect(service.startPagesPublication(input)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        statusCode: 409
      });
      expect(github.createdBranches).toHaveLength(0);
      expect(github.markerCommits).toHaveLength(0);
      expect(github.commits).toHaveLength(0);
      expect(github.pullRequests).toHaveLength(0);
    }

    const createRaceCard = canonicalCard({
      id: "phase-two-race-create",
      slug: "phase-two-race-create",
      title: "Phase Two Race Create"
    });
    await expectRaceConflict(startInput({
      action: "create",
      card: createRaceCard,
      cardId: "phase-two-race-create",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000002301"
    }), (github) => {
      github.onGetBaseBranchHead(() => {
        github.setMainCard("phase-two-race-create", {
          blobSha: "sha-raced-create",
          content: serializeCanonicalCatalogCard(canonicalCard({
            id: "phase-two-race-create",
            slug: "phase-two-race-create",
            title: "Phase Two Race Create Already Exists"
          }))
        });
      });
    });

    const createRaceSameBytesCard = canonicalCard({
      id: "phase-two-race-create-same-bytes",
      slug: "phase-two-race-create-same-bytes",
      title: "Phase Two Race Create"
    });
    await expectRaceConflict(startInput({
      action: "create",
      card: createRaceSameBytesCard,
      cardId: "phase-two-race-create-same-bytes",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-00000000230a"
    }), (github) => {
      github.onGetBaseBranchHead(() => {
        github.setMainCard("phase-two-race-create-same-bytes", {
          blobSha: "sha-raced-create-same-bytes",
          content: serializeCanonicalCatalogCard(createRaceSameBytesCard)
        });
      });
    });

    await expectRaceConflict(startInput({
      action: "update",
      card: canonicalCard({
        id: "phase-two-race-update",
        slug: "phase-two-race-update",
        title: "Phase Two Race Update New"
      }),
      cardId: "phase-two-race-update",
      expectedBlobSha: "sha-race-update-old",
      requestId: "00000000-0000-4000-8000-000000002302"
    }), (github) => {
      github.setMainCard("phase-two-race-update", {
        blobSha: "sha-race-update-old",
        content: serializeCanonicalCatalogCard(canonicalCard({
          id: "phase-two-race-update",
          slug: "phase-two-race-update",
          title: "Phase Two Race Update Old"
        }))
      });
      github.onGetBaseBranchHead(() => {
        github.setMainCard("phase-two-race-update", {
          blobSha: "sha-race-update-new",
          content: serializeCanonicalCatalogCard(canonicalCard({
            id: "phase-two-race-update",
            slug: "phase-two-race-update",
            title: "Phase Two Race Update Changed Elsewhere"
          }))
        });
      });
    });

    await expectRaceConflict(startInput({
      action: "delete",
      card: null,
      cardId: "phase-two-race-delete",
      expectedBlobSha: "sha-race-delete-old",
      requestId: "00000000-0000-4000-8000-000000002303"
    }), (github) => {
      github.setMainCard("phase-two-race-delete", {
        blobSha: "sha-race-delete-old",
        content: serializeCanonicalCatalogCard(canonicalCard({
          id: "phase-two-race-delete",
          slug: "phase-two-race-delete",
          title: "Phase Two Race Delete Old"
        }))
      });
      github.onGetBaseBranchHead(() => {
        github.setMainCard("phase-two-race-delete", {
          blobSha: "sha-race-delete-new",
          content: serializeCanonicalCatalogCard(canonicalCard({
            id: "phase-two-race-delete",
            slug: "phase-two-race-delete",
            title: "Phase Two Race Delete Changed Elsewhere"
          }))
        });
      });
    });

    await expectRaceConflict(startInput({
      action: "delete",
      card: null,
      cardId: "phase-two-race-delete-missing",
      expectedBlobSha: "sha-race-delete-missing-old",
      requestId: "00000000-0000-4000-8000-000000002309"
    }), (github) => {
      github.setMainCard("phase-two-race-delete-missing", {
        blobSha: "sha-race-delete-missing-old",
        content: serializeCanonicalCatalogCard(canonicalCard({
          id: "phase-two-race-delete-missing",
          slug: "phase-two-race-delete-missing",
          title: "Phase Two Race Delete Missing Old"
        }))
      });
      github.onGetBaseBranchHead(() => {
        github.deleteMainCard("phase-two-race-delete-missing");
      });
    });

    await expectRaceConflict(startInput({
      action: "update",
      card: null,
      cardId: "phase-two-race-unpublish-missing",
      expectedBlobSha: "sha-race-unpublish-missing-old",
      lifecycleAction: "unpublish",
      requestId: "00000000-0000-4000-8000-00000000230b"
    }), (github) => {
      github.setMainCard("phase-two-race-unpublish-missing", {
        blobSha: "sha-race-unpublish-missing-old",
        content: serializeCanonicalCatalogCard(canonicalCard({
          id: "phase-two-race-unpublish-missing",
          slug: "phase-two-race-unpublish-missing",
          title: "Phase Two Race Unpublish Missing Old"
        }))
      });
      github.onGetBaseBranchHead(() => {
        github.deleteMainCard("phase-two-race-unpublish-missing");
      });
    });

    const noOpCard = canonicalCard({
      id: "phase-two-race-noop",
      slug: "phase-two-race-noop",
      title: "Phase Two Race Noop Old"
    });
    await expectRaceConflict(startInput({
      action: "update",
      card: noOpCard,
      cardId: "phase-two-race-noop",
      expectedBlobSha: "sha-race-noop-old",
      requestId: "00000000-0000-4000-8000-000000002304"
    }), (github) => {
      github.setMainCard("phase-two-race-noop", {
        blobSha: "sha-race-noop-old",
        content: serializeCanonicalCatalogCard(noOpCard)
      });
      github.onGetBaseBranchHead(() => {
        github.setMainCard("phase-two-race-noop", {
          blobSha: "sha-race-noop-new",
          content: serializeCanonicalCatalogCard({
            ...noOpCard,
            title: "Phase Two Race Noop Changed Elsewhere"
          })
        });
      });
    });
  });

  it("AUTO-MERGE SAFETY enables squash auto-merge only after the required catalog validation check is successful", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const pendingGithub = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "pending"
    });
    const pendingService = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github: pendingGithub,
      lifecycleFinalizer: lifecycleFinalizerFake(),
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
    const published = await pendingService.getPagesPublicationStatus("00000000-0000-4000-8000-000000000501", statusContext());
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
      allowedMediaOrigin: "https://storage.example.test",
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

  it("PHASE 2.2 synchronizes Pages success with idempotent backend lifecycle finalization", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const lifecycleFinalize = vi.fn(async () => undefined);
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });
    const publishRequestId = "00000000-0000-4000-8000-000000001101";
    const unpublishRequestId = "00000000-0000-4000-8000-000000001102";
    const deleteRequestId = "00000000-0000-4000-8000-000000001103";
    const blockedRequestId = "00000000-0000-4000-8000-000000001104";
    const existingCard = canonicalCard({
      id: "phase-two-finalize-unpublish",
      slug: "phase-two-finalize-unpublish",
      title: "Phase Two Finalize Unpublish"
    });
    github.setMainCard("phase-two-finalize-unpublish", {
      blobSha: "sha-finalize-unpublish",
      content: serializeCanonicalCatalogCard(existingCard)
    });
    github.setMainCard("phase-two-finalize-delete", {
      blobSha: "sha-finalize-delete",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-finalize-delete",
        slug: "phase-two-finalize-delete",
        title: "Phase Two Finalize Delete"
      }))
    });
    github.setMainCard("phase-two-finalize-blocked", {
      blobSha: "sha-finalize-blocked",
      content: serializeCanonicalCatalogCard(canonicalCard({
        id: "phase-two-finalize-blocked",
        slug: "phase-two-finalize-blocked",
        title: "Phase Two Finalize Blocked"
      }))
    });

    await service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-finalize-publish",
        slug: "phase-two-finalize-publish",
        title: "Phase Two Finalize Publish"
      }),
      cardId: "phase-two-finalize-publish",
      expectedBlobSha: null,
      requestId: publishRequestId
    }));
    await service.startPagesPublication(startInput({
      action: "update",
      card: {
        ...existingCard,
        active: false
      },
      cardId: "phase-two-finalize-unpublish",
      expectedBlobSha: "sha-finalize-unpublish",
      requestId: unpublishRequestId
    }));
    await service.startPagesPublication(startInput({
      action: "delete",
      card: null,
      cardId: "phase-two-finalize-delete",
      expectedBlobSha: "sha-finalize-delete",
      requestId: deleteRequestId
    }));

    for (const requestId of [publishRequestId, unpublishRequestId, deleteRequestId]) {
      github.setPublicationRequest(requestId, {
        mergeCommitSha: "b".repeat(40),
        pagesStatus: "success",
        state: "merged"
      });
    }

    await expect(service.getPagesPublicationStatus(publishRequestId, statusContext())).resolves.toMatchObject({ status: "published" });
    await expect(service.getPagesPublicationStatus(unpublishRequestId, statusContext())).resolves.toMatchObject({ status: "published" });
    await expect(service.getPagesPublicationStatus(deleteRequestId, statusContext())).resolves.toMatchObject({ status: "published" });
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      lifecycleAction: "publish",
      requestId: publishRequestId,
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      lifecycleAction: "unpublish",
      requestId: unpublishRequestId,
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      lifecycleAction: "delete",
      requestId: deleteRequestId,
      siteId: "00000000-0000-4000-8000-000000000101"
    }));

    lifecycleFinalize.mockRejectedValueOnce(new Error("synthetic finalizer unavailable"));
    await service.startPagesPublication(startInput({
      action: "update",
      card: {
        ...canonicalCard({
          id: "phase-two-finalize-blocked",
          slug: "phase-two-finalize-blocked",
          title: "Phase Two Finalize Blocked"
        }),
        title: "Phase Two Finalize Blocked Update"
      },
      cardId: "phase-two-finalize-blocked",
      expectedBlobSha: "sha-finalize-blocked",
      requestId: blockedRequestId
    }));
    github.setPublicationRequest(blockedRequestId, {
      mergeCommitSha: "c".repeat(40),
      pagesStatus: "success",
      state: "merged"
    });

    await expect(service.getPagesPublicationStatus(blockedRequestId, statusContext())).resolves.toMatchObject({
      code: "BACKEND_LIFECYCLE_FINALIZATION_FAILED",
      status: "failed"
    });
  });

  it("PHASE 2.3 missing-card unpublish is a safe no-op and finalizes backend lifecycle as unpublish", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const lifecycleFinalize = vi.fn(async () => undefined);
    const github = createGitHubProviderFake({
      currentPagesStatus: "success",
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });
    const input = startInput({
      action: "update",
      card: null,
      cardId: "phase-two-missing-unpublish",
      expectedBlobSha: null,
      lifecycleAction: "unpublish",
      requestId: "00000000-0000-4000-8000-000000002305"
    });

    await expect(service.startPagesPublication(input)).resolves.toMatchObject({
      action: "update",
      cardId: "phase-two-missing-unpublish",
      noOp: true,
      status: "published"
    });
    expect(github.commits).toHaveLength(0);
    expect(github.pullRequests).toHaveLength(0);
    expect(github.markerCommits).toEqual([
      expect.objectContaining({
        lifecycleAction: "unpublish",
        requestFingerprint: await expectedRequestFingerprint(input)
      })
    ]);
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      cardId: "phase-two-missing-unpublish",
      lifecycleAction: "unpublish",
      requestId: "00000000-0000-4000-8000-000000002305"
    }));

    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        active: false,
        id: "phase-two-inactive-create",
        slug: "phase-two-inactive-create",
        title: "Phase Two Inactive Create"
      }),
      cardId: "phase-two-inactive-create",
      expectedBlobSha: null,
      lifecycleAction: "publish",
      requestId: "00000000-0000-4000-8000-000000002306"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
  });

  it("PHASE 2.3 server-owned reconciler finalizes lifecycle after Pages success when the browser is closed", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const lifecycleFinalize = vi.fn(async () => undefined);
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });
    const reconciledCard = canonicalCard({
      active: false,
      id: "phase-two-reconcile-unpublish",
      slug: "phase-two-reconcile-unpublish",
      title: "Phase Two Reconcile Unpublish"
    });
    const reconciledFile = {
      blobSha: "blob-reconcile-unpublish",
      content: serializeCanonicalCatalogCard(reconciledCard)
    };
    github.setRefCard("e".repeat(40), "phase-two-reconcile-unpublish", reconciledFile);
    github.setMainCard("phase-two-reconcile-unpublish", reconciledFile);
    github.setRecentPublicationRequests([
      {
        action: "update",
        branch: "catalog/publish/00000000-0000-4000-8000-000000002307",
        cardId: "phase-two-reconcile-unpublish",
        lifecycleAction: "unpublish",
        mergeCommitSha: "e".repeat(40),
        pagesStatus: "success",
        requestFingerprint: "f".repeat(64),
        requestId: "00000000-0000-4000-8000-000000002307",
        siteId: "00000000-0000-4000-8000-000000000101",
        state: "merged"
      },
      {
        action: "create",
        branch: "feature/not-direct-pages",
        cardId: "phase-two-reconcile-ignored",
        lifecycleAction: "publish",
        pagesStatus: "success",
        requestFingerprint: "f".repeat(64),
        requestId: "00000000-0000-4000-8000-000000002308",
        siteId: "00000000-0000-4000-8000-000000000101",
        state: "merged"
      }
    ]);

    await expect(service.reconcilePagesPublicationLifecycle({
      actor: systemActor(),
      limit: 5,
      now: fixedNow()
    })).resolves.toMatchObject({
      failed: 0,
      finalized: 1,
      scanned: 1
    });
    expect(lifecycleFinalize).toHaveBeenCalledTimes(1);
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({
        email: "system@web00.local",
        role: "admin"
      }),
      cardId: "phase-two-reconcile-unpublish",
      lifecycleAction: "unpublish",
      requestId: "00000000-0000-4000-8000-000000002307",
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(github.deletedBranches).toEqual([
      { branch: "catalog/publish/00000000-0000-4000-8000-000000002307" }
    ]);
  });

  it("RECOVERY resumes an existing request branch and NO-OP does not claim published before Pages success", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      currentPagesStatus: "pending",
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
      now: fixedNow
    });
    const card = canonicalCard({
      id: "phase-two-recovered",
      slug: "phase-two-recovered",
      title: "Phase Two Recovered"
    });
    const content = serializeCanonicalCatalogCard(card);
    github.setMainCard("phase-two-recovered", {
      blobSha: "sha-recovered-main",
      content
    });
    const noOp = await service.startPagesPublication(startInput({
      action: "update",
      card,
      cardId: "phase-two-recovered",
      expectedBlobSha: "sha-recovered-main",
      requestId: "00000000-0000-4000-8000-000000000701"
    }));

    expect(noOp).toMatchObject({
      noOp: true,
      status: "deploying"
    });
    expect(noOp.status).not.toBe("published");
    expect(github.createdBranches).toHaveLength(1);
    expect(github.markerCommits).toHaveLength(1);
    expect(github.pullRequests).toHaveLength(0);

    github.setCurrentPagesStatus("success");
    const verifiedNoOp = await service.startPagesPublication(startInput({
      action: "update",
      card,
      cardId: "phase-two-recovered",
      expectedBlobSha: "sha-recovered-main",
      requestId: "00000000-0000-4000-8000-000000000702"
    }));

    expect(verifiedNoOp).toMatchObject({
      noOp: true,
      status: "published"
    });

    const recoveredRequestId = "00000000-0000-4000-8000-000000000703";
    const recoveredBranch = `catalog/publish/${recoveredRequestId}`;
    const newCard = canonicalCard({
      id: "phase-two-recovered-new",
      slug: "phase-two-recovered-new",
      title: "Phase Two Recovered New"
    });
    const newContent = serializeCanonicalCatalogCard(newCard);
    github.setBranchHead(recoveredBranch, "branch-sha-recovered");
    github.setBranchCard(recoveredBranch, "phase-two-recovered-new", {
      blobSha: "sha-branch-card",
      content: newContent
    });

    const recoveredInput = startInput({
      action: "create",
      card: newCard,
      cardId: "phase-two-recovered-new",
      expectedBlobSha: null,
      requestId: recoveredRequestId
    });
    github.setBranchPublicationRequest(recoveredRequestId, {
      action: "create",
      branch: recoveredBranch,
      cardId: "phase-two-recovered-new",
      requestFingerprint: await expectedRequestFingerprint(recoveredInput),
      requestId: recoveredRequestId
    });

    const recovered = await service.startPagesPublication(recoveredInput);

    expect(recovered).toMatchObject({
      cardId: "phase-two-recovered-new",
      status: "merge_queued"
    });
    expect(github.createBranch).not.toHaveBeenCalledWith({
      branch: recoveredBranch,
      fromSha: expect.any(String)
    });
    expect(github.commits.filter((commit) => commit.path === "catalog/cards/phase-two-recovered-new.json")).toHaveLength(0);
    expect(github.pullRequests.at(-1)).toMatchObject({
      branch: recoveredBranch,
      requestId: recoveredRequestId
    });

    github.setPublicationRequest(recoveredRequestId, {
      requestFingerprint: "f".repeat(64)
    });
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: {
        ...newCard,
        title: "Phase Two Recovered Different"
      },
      cardId: "phase-two-recovered-new",
      expectedBlobSha: null,
      requestId: recoveredRequestId
    }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409
    });
  });

  it("VALIDATION rejects mutable card identity and unsafe absolute media before creating GitHub mutations", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
      now: fixedNow
    });

    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        galleryImages: [
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/site/gallery/legacy-a/1200.webp",
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/site/gallery/asset/1200.webp"
        ],
        id: "phase-two-valid-media",
        previewImage: "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/site/preview/asset/1200.webp",
        slug: "phase-two-valid-media",
        title: "Phase Two Valid Media"
      }),
      cardId: "phase-two-valid-media",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000801"
    }))).resolves.toMatchObject({
      status: "merge_queued"
    });

    const githubCallsBeforeInvalid = github.createdBranches.length + github.commits.length + github.pullRequests.length;

    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-wrong-id",
        slug: "phase-two-wrong-id",
        title: "Phase Two Wrong ID"
      }),
      cardId: "phase-two-public-id",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000802"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        galleryImages: [
          "https://storage.example.test/storage/v1/object/public/other-bucket/sites/site/gallery/asset/1200.webp"
        ],
        id: "phase-two-unsafe-media",
        previewImage: "https://evil.example.test/storage/v1/object/public/web00-catalog-images/sites/site/preview/asset/1200.webp",
        slug: "phase-two-unsafe-media",
        title: "Phase Two Unsafe Media"
      }),
      cardId: "phase-two-unsafe-media",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000000803"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
    expect(github.createdBranches.length + github.commits.length + github.pullRequests.length).toBe(githubCallsBeforeInvalid);
  });

  it("PHASE 2.2 media policy preserves legacy relative media but rejects new unsafe relative or decorated absolute media", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      now: fixedNow
    });
    const legacyCard = canonicalCard({
      galleryImages: ["assets/img/solution-gallery/legacy-a.png"],
      id: "site-custom",
      previewImage: "assets/img/previews/legacy.png",
      slug: "site-custom",
      title: "Phase Two Legacy Media"
    });
    github.setMainCard("site-custom", {
      blobSha: "sha-legacy-media",
      content: serializeCanonicalCatalogCard(legacyCard)
    });
    const nonLegacyRelativeCard = canonicalCard({
      galleryImages: ["assets/img/solution-gallery/nonlegacy-a.png"],
      id: "phase-two-nonlegacy-relative",
      previewImage: "assets/img/previews/nonlegacy.png",
      slug: "phase-two-nonlegacy-relative",
      title: "Phase Two Non Legacy Relative"
    });
    github.setMainCard("phase-two-nonlegacy-relative", {
      blobSha: "sha-nonlegacy-relative",
      content: serializeCanonicalCatalogCard(nonLegacyRelativeCard)
    });

    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: {
        ...legacyCard,
        title: "Phase Two Legacy Media Renamed"
      },
      cardId: "site-custom",
      expectedBlobSha: "sha-legacy-media",
      requestId: "00000000-0000-4000-8000-000000001201"
    }))).resolves.toMatchObject({
      status: "merge_queued"
    });
    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: {
        ...nonLegacyRelativeCard,
        title: "Phase Two Non Legacy Relative Renamed"
      },
      cardId: "phase-two-nonlegacy-relative",
      expectedBlobSha: "sha-nonlegacy-relative",
      requestId: "00000000-0000-4000-8000-000000001205"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-new-relative",
        previewImage: "assets/img/previews/new-relative.png",
        slug: "phase-two-new-relative",
        title: "Phase Two New Relative"
      }),
      cardId: "phase-two-new-relative",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000001202"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
    await expect(service.startPagesPublication(startInput({
      action: "update",
      card: {
        ...legacyCard,
        galleryImages: ["assets/img/solution-gallery/replaced-relative.png"]
      },
      cardId: "site-custom",
      expectedBlobSha: "sha-legacy-media",
      requestId: "00000000-0000-4000-8000-000000001203"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
    await expect(service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-decorated-absolute",
        previewImage: "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/site/preview/asset/1200.webp?download=1",
        slug: "phase-two-decorated-absolute",
        title: "Phase Two Decorated Absolute"
      }),
      cardId: "phase-two-decorated-absolute",
      expectedBlobSha: null,
      requestId: "00000000-0000-4000-8000-000000001204"
    }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400
    });
  });

  it("PHASE 2.2 temporary branch cleanup failure never downgrades a verified publication", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    github.deleteTemporaryBranch.mockRejectedValueOnce(new Error("synthetic cleanup failed"));
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: lifecycleFinalizerFake(),
      now: fixedNow
    });
    const requestId = "00000000-0000-4000-8000-000000001301";

    await service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-cleanup",
        slug: "phase-two-cleanup",
        title: "Phase Two Cleanup"
      }),
      cardId: "phase-two-cleanup",
      expectedBlobSha: null,
      requestId
    }));
    github.setPublicationRequest(requestId, {
      mergeCommitSha: "d".repeat(40),
      pagesStatus: "success",
      state: "merged"
    });

    await expect(service.getPagesPublicationStatus(requestId, statusContext())).resolves.toMatchObject({
      status: "published"
    });
    expect(github.deleteTemporaryBranch).toHaveBeenCalledTimes(1);
  });

  it("CONCURRENCY treats closed and conflicted pull requests as terminal failures", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      now: fixedNow
    });
    const closedRequestId = "00000000-0000-4000-8000-000000000901";
    const conflictRequestId = "00000000-0000-4000-8000-000000000902";

    await service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-closed-pr",
        slug: "phase-two-closed-pr",
        title: "Phase Two Closed PR"
      }),
      cardId: "phase-two-closed-pr",
      expectedBlobSha: null,
      requestId: closedRequestId
    }));
    github.setPublicationRequest(closedRequestId, {
      state: "closed"
    });
    await expect(service.getPagesPublicationStatus(closedRequestId)).resolves.toMatchObject({
      code: "PULL_REQUEST_CLOSED",
      retryable: false,
      status: "failed"
    });

    await service.startPagesPublication(startInput({
      action: "create",
      card: canonicalCard({
        id: "phase-two-conflicted-pr",
        slug: "phase-two-conflicted-pr",
        title: "Phase Two Conflicted PR"
      }),
      cardId: "phase-two-conflicted-pr",
      expectedBlobSha: null,
      requestId: conflictRequestId
    }));
    github.setPublicationRequest(conflictRequestId, {
      mergeableState: "dirty"
    });
    await expect(service.getPagesPublicationStatus(conflictRequestId)).resolves.toMatchObject({
      code: "PULL_REQUEST_CONFLICTED",
      retryable: false,
      status: "failed"
    });
    expect(github.enableAutoMerge).toHaveBeenCalledTimes(2);
  });

  it("PHASE 2.4 supersedes stale same-site lifecycle work after publish-unpublish and delete-recreate races", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
    const lifecycleFinalize = vi.fn(async () => undefined);
    const github = createGitHubProviderFake({
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const service = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });

    const cardId = "phase-two-supersession";
    const published = canonicalCard({ id: cardId, slug: cardId, title: "Published A" });
    const unpublished = { ...published, active: false, title: "Unpublished B" };
    const publishRequestId = "00000000-0000-4000-8000-000000002401";
    const unpublishRequestId = "00000000-0000-4000-8000-000000002402";

    const publishMergeSha = "1".repeat(40);
    const unpublishMergeSha = "2".repeat(40);
    const deleteMergeSha = "3".repeat(40);
    github.setRefCard(publishMergeSha, cardId, {
      blobSha: "blob-publish-a",
      content: serializeCanonicalCatalogCard(published)
    });
    github.setRefCard(unpublishMergeSha, cardId, {
      blobSha: "blob-unpublish-b",
      content: serializeCanonicalCatalogCard(unpublished)
    });
    github.setMainCard(cardId, {
      blobSha: "blob-unpublish-b",
      content: serializeCanonicalCatalogCard(unpublished)
    });
    github.setSyntheticRequest(publishRequestId, {
      action: "update",
      branch: `catalog/publish/${publishRequestId}`,
      cardId,
      lifecycleAction: "publish",
      mergeCommitSha: publishMergeSha,
      pagesStatus: "success",
      requestFingerprint: "a".repeat(64),
      requestId: publishRequestId,
      siteId: "00000000-0000-4000-8000-000000000101",
      state: "merged"
    });
    github.setSyntheticRequest(unpublishRequestId, {
      action: "update",
      branch: `catalog/publish/${unpublishRequestId}`,
      cardId,
      lifecycleAction: "unpublish",
      mergeCommitSha: unpublishMergeSha,
      pagesStatus: "success",
      requestFingerprint: "b".repeat(64),
      requestId: unpublishRequestId,
      siteId: "00000000-0000-4000-8000-000000000101",
      state: "merged"
    });

    await expect(service.getPagesPublicationStatus(publishRequestId, statusContext())).resolves.toMatchObject({
      code: "PUBLICATION_SUPERSEDED",
      retryable: false,
      status: "superseded"
    });
    await expect(service.getPagesPublicationStatus(unpublishRequestId, statusContext())).resolves.toMatchObject({
      status: "published"
    });
    expect(lifecycleFinalize).toHaveBeenCalledTimes(1);
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({ lifecycleAction: "unpublish" }));

    lifecycleFinalize.mockClear();
    const deleteRequestId = "00000000-0000-4000-8000-000000002403";
    github.setRefCard(deleteMergeSha, cardId, null);
    github.setMainCard(cardId, {
      blobSha: "blob-recreated",
      content: serializeCanonicalCatalogCard({ ...published, title: "Recreated" })
    });
    github.setSyntheticRequest(deleteRequestId, {
      action: "delete",
      branch: `catalog/publish/${deleteRequestId}`,
      cardId,
      lifecycleAction: "delete",
      mergeCommitSha: deleteMergeSha,
      pagesStatus: "success",
      requestFingerprint: "c".repeat(64),
      requestId: deleteRequestId,
      siteId: "00000000-0000-4000-8000-000000000101",
      state: "merged"
    });

    await expect(service.getPagesPublicationStatus(deleteRequestId, statusContext())).resolves.toMatchObject({
      code: "PUBLICATION_SUPERSEDED",
      status: "superseded"
    });
    expect(lifecycleFinalize).not.toHaveBeenCalled();
  });

  it("PHASE 2.4 reconciliation worker catches interval failures, survives, and stop waits for the active run", async () => {
    vi.useFakeTimers();
    try {
      const { createPagesCatalogPublicationReconciliationWorker } = await loadPublicationServiceExports();
      const onError = vi.fn(() => {
        throw new Error("synthetic diagnostics failure");
      });
      let releaseSecondRun!: () => void;
      const secondRun = new Promise<void>((resolve) => {
        releaseSecondRun = resolve;
      });
      const reconcilePagesPublicationLifecycle = vi.fn()
        .mockRejectedValueOnce(new Error("synthetic GitHub list failure"))
        .mockImplementationOnce(async () => {
          await secondRun;
          return { failed: 0, finalized: 1, scanned: 1 };
        });
      const worker = createPagesCatalogPublicationReconciliationWorker({
        actor: systemActor(),
        intervalMs: 60_000,
        onError,
        service: { reconcilePagesPublicationLifecycle }
      });

      worker.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(reconcilePagesPublicationLifecycle).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(reconcilePagesPublicationLifecycle).toHaveBeenCalledTimes(2);
      let stopped = false;
      const stopPromise = worker.stop().then(() => { stopped = true; });
      await Promise.resolve();
      expect(stopped).toBe(false);
      releaseSecondRun();
      await stopPromise;
      expect(stopped).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("PHASE 2.4 recovers a marker-only missing-card unpublish after restart and cleans the branch", async () => {
    const { createPagesCatalogPublicationService } = await loadPublicationServiceExports();
    const lifecycleFinalize = vi.fn(async () => undefined);
    const github = createGitHubProviderFake({
      currentPagesStatus: "pending",
      requiredCheckConfigured: true,
      requiredCheckStatus: "success"
    });
    const firstProcess = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });
    const requestId = "00000000-0000-4000-8000-000000002404";
    const cardId = "phase-two-marker-unpublish";

    await expect(firstProcess.startPagesPublication(startInput({
      action: "update",
      card: null,
      cardId,
      expectedBlobSha: null,
      lifecycleAction: "unpublish",
      requestId
    }))).resolves.toMatchObject({
      noOp: true,
      status: "deploying"
    });
    expect(github.markerCommits).toHaveLength(1);
    expect(github.markerCommits[0]).toMatchObject({ noOp: true });
    expect(lifecycleFinalize).not.toHaveBeenCalled();

    github.setRecentPublicationRequests(Array.from({ length: 5 }, (_, index) => ({
      action: "update",
      cardId: `already-closed-${index}`,
      requestId: `00000000-0000-4000-8000-00000000300${index}`,
      state: "closed"
    })));
    github.setRecentMarkerRequests([
      {
        ...github.markerCommits[0],
        noOp: true,
        state: "marker"
      },
      {
        action: "update",
        branch: "catalog/publish/00000000-0000-4000-8000-000000002405",
        cardId: "interrupted-real-mutation",
        expectedBlobSha: "previous-blob",
        lifecycleAction: "publish",
        noOp: false,
        requestFingerprint: "e".repeat(64),
        requestId: "00000000-0000-4000-8000-000000002405",
        siteId: "00000000-0000-4000-8000-000000000102",
        state: "open"
      }
    ]);
    github.setCurrentPagesStatus("success");
    const restartedProcess = createPagesCatalogPublicationService({
      allowedMediaOrigin: "https://storage.example.test",
      github,
      lifecycleFinalizer: { finalize: lifecycleFinalize },
      now: fixedNow
    });

    await expect(restartedProcess.reconcilePagesPublicationLifecycle({
      actor: systemActor(),
      limit: 5,
      now: fixedNow()
    })).resolves.toEqual({
      failed: 0,
      finalized: 1,
      scanned: 1
    });
    expect(lifecycleFinalize).toHaveBeenCalledWith(expect.objectContaining({
      lifecycleAction: "unpublish",
      requestId
    }));
    expect(github.deletedBranches).toContainEqual({ branch: `catalog/publish/${requestId}` });
  });

});

async function loadPublicationServiceExports(): Promise<Record<string, any>> {
  const module = await import(publicationServiceModulePath) as Record<string, unknown>;
  const createPagesCatalogPublicationService = module.createPagesCatalogPublicationService;
  const createPagesCatalogPublicationReconciliationWorker = module.createPagesCatalogPublicationReconciliationWorker;

  expect(typeof createPagesCatalogPublicationService).toBe("function");
  expect(typeof createPagesCatalogPublicationReconciliationWorker).toBe("function");

  return {
    createPagesCatalogPublicationService,
    createPagesCatalogPublicationReconciliationWorker
  };
}

async function loadPagesCatalogGenerator(): Promise<{
  serializeCanonicalCatalogCard(card: Record<string, unknown>): string;
}> {
  const module = await import(publicationServiceModulePath) as Record<string, unknown>;
  const serializeCanonicalCatalogCard = module.serializeCanonicalCatalogCard;

  expect(typeof serializeCanonicalCatalogCard).toBe("function");

  return {
    serializeCanonicalCatalogCard: serializeCanonicalCatalogCard as (card: Record<string, unknown>) => string
  };
}

function createGitHubProviderFake(options: {
  currentPagesStatus?: "failure" | "pending" | "success";
  requiredCheckConfigured: boolean;
  requiredCheckStatus: "failure" | "pending" | "success";
}) {
  let currentPagesStatus = options.currentPagesStatus ?? "success";
  let getBaseBranchHeadHook: (() => void) | null = null;
  let requiredCheckStatus = options.requiredCheckStatus;
  const branchCards = new Map<string, { blobSha: string; content: string } | null>();
  const branchHeads = new Map<string, string>();
  const branchPublicationRequests = new Map<string, Record<string, unknown>>();
  const mainCards = new Map<string, { blobSha: string; content: string }>();
  let recentPublicationRequests: Record<string, unknown>[] = [];
  let recentMarkerRequests: Record<string, unknown>[] = [];
  const requests = new Map<string, Record<string, unknown>>();
  const github = {
    autoMergeRequests: [] as Record<string, unknown>[],
    commits: [] as Record<string, unknown>[],
    createdBranches: [] as Record<string, unknown>[],
    deletedBranches: [] as Record<string, unknown>[],
    markerCommits: [] as Record<string, unknown>[],
    pullRequests: [] as Record<string, unknown>[],
    createBranch: vi.fn(async (input: Record<string, unknown>) => {
      github.createdBranches.push(input);
      branchHeads.set(String(input.branch), String(input.fromSha));
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
    createPublicationMarkerCommit: vi.fn(async (input: Record<string, unknown>) => {
      github.markerCommits.push(input);
      branchPublicationRequests.set(String(input.requestId), {
        ...input,
        state: "preparing"
      });
      return { commitSha: `marker_${github.markerCommits.length}` };
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
    getBaseBranchHead: vi.fn(async () => {
      getBaseBranchHeadHook?.();
      return "main-sha";
    }),
    getBranchHead: vi.fn(async (input: Record<string, unknown>) => branchHeads.get(String(input.branch)) ?? null),
    getPublicationBranchRequest: vi.fn(async (requestId: string) => branchPublicationRequests.get(requestId) ?? null),
    getCatalogCard: vi.fn(async (cardId: string, readOptions?: Record<string, unknown>) => {
      const ref = typeof readOptions?.ref === "string" ? readOptions.ref : null;

      return ref === null || ref === "main-sha"
        ? mainCards.get(cardId) ?? null
        : branchCards.get(`${ref}:${cardId}`) ?? null;
    }),
    getCurrentPagesDeploymentStatus: vi.fn(async () => ({
      headSha: "main-sha",
      status: currentPagesStatus
    })),
    getRequiredCatalogCheckStatus: vi.fn(async () => ({
      configured: options.requiredCheckConfigured,
      status: requiredCheckStatus
    })),
    listRecentPublicationRequests: vi.fn(async (input: Record<string, unknown>) => {
      const limit = typeof input.limit === "number" ? input.limit : recentPublicationRequests.length;
      return recentPublicationRequests.slice(0, limit);
    }),
    listRecentPublicationMarkerRequests: vi.fn(async (input: Record<string, unknown>) => {
      const limit = typeof input.limit === "number" ? input.limit : recentMarkerRequests.length;
      return recentMarkerRequests.slice(0, limit);
    }),
    onGetBaseBranchHead(callback: () => void) {
      getBaseBranchHeadHook = callback;
    },
    setBranchCard(branch: string, cardId: string, value: { blobSha: string; content: string }) {
      branchCards.set(`${branch}:${cardId}`, value);
    },
    setRefCard(ref: string, cardId: string, value: { blobSha: string; content: string } | null) {
      branchCards.set(`${ref}:${cardId}`, value);
    },
    setBranchHead(branch: string, sha: string) {
      branchHeads.set(branch, sha);
    },
    setBranchPublicationRequest(requestId: string, value: Record<string, unknown>) {
      branchPublicationRequests.set(requestId, value);
    },
    setCurrentPagesStatus(status: "failure" | "pending" | "success") {
      currentPagesStatus = status;
    },
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
      const updated = {
        ...request,
        ...patch
      };
      requests.set(requestId, updated);

      if (updated.state === "merged" && typeof updated.mergeCommitSha === "string") {
        const cardId = String(updated.cardId);
        const branch = String(updated.branch);
        const commit = [...github.commits].reverse().find((item) => item.branch === branch);
        if (commit?.content === null) {
          mainCards.delete(cardId);
          branchCards.set(`${updated.mergeCommitSha}:${cardId}`, null);
        } else if (typeof commit?.content === "string") {
          const card = {
            blobSha: `blob-${updated.mergeCommitSha}`,
            content: commit.content
          };
          mainCards.set(cardId, card);
          branchCards.set(`${updated.mergeCommitSha}:${cardId}`, card);
        }
      }
    },
    setSyntheticRequest(requestId: string, value: Record<string, unknown>) {
      requests.set(requestId, value);
    },
    setMainCard(cardId: string, value: { blobSha: string; content: string }) {
      mainCards.set(cardId, value);
    },
    deleteMainCard(cardId: string) {
      mainCards.delete(cardId);
    },
    setRecentPublicationRequests(value: Record<string, unknown>[]) {
      recentPublicationRequests = value;
    },
    setRecentMarkerRequests(value: Record<string, unknown>[]) {
      recentMarkerRequests = value;
    }
  };

  return github;
}

function startInput(overrides: Record<string, unknown>): Record<string, unknown> {
  const lifecycleAction = overrides.lifecycleAction ?? defaultLifecycleAction(overrides);
  return {
    actor: {
      email: "admin@example.test",
      id: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      sessionId: "00000000-0000-4000-8000-000000000002",
      tokenId: "00000000-0000-4000-8000-000000000003"
    },
    lifecycleAction,
    now: fixedNow(),
    siteId: "00000000-0000-4000-8000-000000000101",
    ...overrides
  };
}

function defaultLifecycleAction(overrides: Record<string, unknown>): "delete" | "publish" | "unpublish" {
  if (overrides.action === "delete") {
    return "delete";
  }
  if (
    overrides.action === "update" &&
    typeof overrides.card === "object" &&
    overrides.card !== null &&
    !Array.isArray(overrides.card) &&
    (overrides.card as { active?: unknown }).active === false
  ) {
    return "unpublish";
  }

  return "publish";
}

function statusContext(): Record<string, unknown> {
  return {
    actor: startInput({}).actor,
    now: fixedNow()
  };
}

function systemActor(): Record<string, unknown> {
  return {
    email: "system@web00.local",
    id: "00000000-0000-4000-8000-000000000901",
    role: "admin",
    sessionId: "00000000-0000-4000-8000-000000000902",
    tokenId: "00000000-0000-4000-8000-000000000903"
  };
}

function lifecycleFinalizerFake() {
  return {
    finalize: vi.fn(async () => undefined)
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
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/synthetic/gallery/a/1200.webp",
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/synthetic/gallery/b/1200.webp"
    ],
    id: "phase-two-card",
    legacyTitle: "Phase Two Card",
    originalDemoUrl: "https://example.com/demo",
    previewImage: "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/synthetic/preview/main/1200.webp",
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

async function expectedRequestFingerprint(input: Record<string, unknown>): Promise<string> {
  const { serializeCanonicalCatalogCard } = await loadPagesCatalogGenerator();
  return createHash("sha256")
    .update(JSON.stringify({
      action: input.action,
      cardId: input.cardId,
      cardSha256: input.card === null
        ? null
        : createHash("sha256").update(serializeCanonicalCatalogCard(input.card as Record<string, unknown>)).digest("hex"),
      expectedBlobSha: input.expectedBlobSha,
      lifecycleAction: input.lifecycleAction,
      requestContract: "web00-direct-pages-catalog-publication-v1",
      siteId: input.siteId
    }))
    .digest("hex");
}
