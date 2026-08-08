import express, { type Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import type {
  PublicCatalogControlState,
  UpdatePublicCatalogSettingsResult
} from "../src/modules/public-catalog/public-catalog-control.repository.js";

const modulePath = "../src/modules/admin/public-catalog/public-catalog-settings.routes.js";

describe("admin public catalog settings routes", () => {
  it("returns durable public catalog status for admins and denies editors with audit.read", async () => {
    const createRouter = await importSettingsRouter();
    const dependencies = createDependencies({
      state: controlState({
        currentItemsCount: 12,
        currentSnapshotPath: "snapshots/catalog-rev8.json",
        desiredRevision: 8,
        lastSyncErrorCode: "LAST_TRANSIENT",
        lastSyncRequestId: "req_last_sync",
        publishedRevision: 8,
        showDemoInModal: false,
        syncStatus: "ready"
      })
    });
    const app = createSettingsRouteApp(createRouter(dependencies));

    const response = await request(app)
      .get("/api/admin/public-catalog/status")
      .set("Authorization", "Bearer admin")
      .expect(200);

    expect(response.body.data).toMatchObject({
      currentItemsCount: 12,
      currentSnapshotPath: "snapshots/catalog-rev8.json",
      desiredRevision: 8,
      lastSyncErrorCode: "LAST_TRANSIENT",
      lastSyncRequestId: "req_last_sync",
      publishedRevision: 8,
      showDemoInModal: false,
      syncStatus: "ready"
    });
    expect(dependencies.statusReader.readState).toHaveBeenCalledTimes(1);

    const editor = await request(app)
      .get("/api/admin/public-catalog/status")
      .set("Authorization", "Bearer editor")
      .expect(403);

    expect(editor.body.error).toMatchObject({ code: "FORBIDDEN" });
    expect(dependencies.statusReader.readState).toHaveBeenCalledTimes(1);
  });

  it("rejects settings mutations without exact CSRF or with malformed body", async () => {
    const createRouter = await importSettingsRouter();
    const dependencies = createDependencies({
      state: controlState({ showDemoInModal: false })
    });
    const app = createSettingsRouteApp(createRouter(dependencies));

    const missingCsrf = await request(app)
      .patch("/api/admin/public-catalog/settings")
      .set("Authorization", "Bearer admin")
      .send({ showDemoInModal: true })
      .expect(403);

    expect(missingCsrf.body.error).toMatchObject({ code: "FORBIDDEN" });

    const malformed = await request(app)
      .patch("/api/admin/public-catalog/settings")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .send({ showDemoInModal: "true" })
      .expect(400);

    expect(malformed.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(dependencies.updateSettings).not.toHaveBeenCalled();
    expect(dependencies.reconciler.requestReconcile).not.toHaveBeenCalled();
  });

  it("marks changed demo-modal settings dirty and requests Atomic reconciliation without inline publication", async () => {
    const createRouter = await importSettingsRouter();
    const dependencies = createDependencies({
      state: controlState({
        desiredRevision: 9,
        publishedRevision: 8,
        showDemoInModal: true,
        syncStatus: "pending"
      }),
      updateResult: {
        desiredRevision: 9,
        marked: true,
        settings: { showDemoInModal: true }
      }
    });
    const app = createSettingsRouteApp(createRouter(dependencies));

    const response = await request(app)
      .patch("/api/admin/public-catalog/settings")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .set("X-Request-Id", "req_demo_modal_enable")
      .send({ showDemoInModal: true })
      .expect(200);

    expect(dependencies.updateSettings).toHaveBeenCalledTimes(1);
    expect(dependencies.updateSettings).toHaveBeenCalledWith(
      { showDemoInModal: true },
      expect.objectContaining({
        actor: expect.objectContaining({ id: adminPrincipal().id }),
        requestId: "req_demo_modal_enable"
      })
    );
    expect(dependencies.reconciler.requestReconcile).toHaveBeenCalledTimes(1);
    expect(dependencies.reconciler.requestReconcile).toHaveBeenCalledWith({
      reason: "settings.show_demo_in_modal",
      requestId: "req_demo_modal_enable"
    });
    expect(response.body.data).toMatchObject({
      showDemoInModal: true,
      status: expect.objectContaining({
        desiredRevision: 9,
        publishedRevision: 8,
        showDemoInModal: true,
        syncStatus: "pending"
      }),
      sync: { status: "pending" }
    });
  });

  it("leaves unchanged ready settings clean and reports the current durable ready status", async () => {
    const createRouter = await importSettingsRouter();
    const dependencies = createDependencies({
      state: controlState({
        desiredRevision: 8,
        publishedRevision: 8,
        showDemoInModal: false,
        syncStatus: "ready"
      }),
      updateResult: {
        marked: false,
        reason: "unchanged",
        settings: { showDemoInModal: false }
      }
    });
    const app = createSettingsRouteApp(createRouter(dependencies));

    const response = await request(app)
      .patch("/api/admin/public-catalog/settings")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .set("X-Request-Id", "req_demo_modal_unchanged")
      .send({ showDemoInModal: false })
      .expect(200);

    expect(dependencies.updateSettings).toHaveBeenCalledTimes(1);
    expect(dependencies.reconciler.requestReconcile).not.toHaveBeenCalled();
    expect(response.body.data).toMatchObject({
      showDemoInModal: false,
      status: expect.objectContaining({
        desiredRevision: 8,
        publishedRevision: 8,
        showDemoInModal: false,
        syncStatus: "ready"
      }),
      sync: { status: "ready" }
    });
  });
});

async function importSettingsRouter(): Promise<
  (options: ReturnType<typeof createDependencies>) => Router
> {
  try {
    const module = await import(modulePath);
    const createRouter = module.createAdminPublicCatalogSettingsRouter;
    if (typeof createRouter !== "function") {
      throw new Error("Expected createAdminPublicCatalogSettingsRouter export.");
    }
    return createRouter as (options: ReturnType<typeof createDependencies>) => Router;
  } catch (error) {
    throw new Error("Expected admin public catalog settings router to exist.", {
      cause: error
    });
  }
}

function createSettingsRouteApp(settingsRouter: Router): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((request_, _response, next) => {
    const authorization = request_.get("Authorization");
    if (authorization === "Bearer admin") {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = adminPrincipal();
    } else if (authorization === "Bearer editor") {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = editorPrincipal();
    }
    next();
  });
  app.use("/api/admin", settingsRouter);
  app.use(errorHandler);

  return app;
}

function createDependencies(options: {
  state: PublicCatalogControlState;
  updateResult?: UpdatePublicCatalogSettingsResult;
}) {
  return {
    reconciler: {
      requestReconcile: vi.fn()
    },
    statusReader: {
      readState: vi.fn(async () => ({
        kind: "state" as const,
        state: options.state
      }))
    },
    updateSettings: vi.fn(async () =>
      options.updateResult ?? {
        desiredRevision: options.state.desiredRevision,
        marked: true as const,
        settings: { showDemoInModal: options.state.showDemoInModal }
      }
    )
  };
}

function controlState(
  overrides: Partial<PublicCatalogControlState> = {}
): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotGeneratedAt: null,
    currentSnapshotPath: null,
    desiredRevision: 8,
    id: "public-catalog",
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 8,
    publishedRuntimeTargetKey: "runtime/production",
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "ready",
    ...overrides
  };
}

function adminPrincipal(): AuthenticatedPrincipal {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}

function editorPrincipal(): AuthenticatedPrincipal {
  return {
    ...adminPrincipal(),
    email: "editor@example.test",
    role: "editor"
  };
}
