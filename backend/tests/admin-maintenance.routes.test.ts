import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminMaintenanceRouter } from "../src/modules/admin/maintenance/maintenance.routes.js";
import type { AdminMaintenanceService } from "../src/modules/admin/maintenance/maintenance.service.js";
import type { CanonicalAssetReconciliationReport } from "../src/modules/admin/sites/canonical-asset-reconciliation.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";

describe("admin canonical asset maintenance routes", () => {
  it("requires admin RBAC for dry-run", async () => {
    const service = createMaintenanceService();

    await request(createApp(service)).get("/api/admin/maintenance/canonical-assets").expect(401);
    await request(createApp(service, editorPrincipal())).get("/api/admin/maintenance/canonical-assets").expect(403);

    const response = await request(createApp(service, adminPrincipal()))
      .get("/api/admin/maintenance/canonical-assets")
      .expect(200);

    expect(response.body.data).toMatchObject({ status: "ready" });
    expect(service.dryRun).toHaveBeenCalledTimes(1);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("dry-run performs zero writes and response does not contain secret material", async () => {
    const service = createMaintenanceService();

    const response = await request(createApp(service, adminPrincipal()))
      .get("/api/admin/maintenance/canonical-assets")
      .expect(200);

    expect(response.body.data.totals).toMatchObject({
      plannedGalleryUrlUpdates: 12,
      plannedPreviewUpdates: 3
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /DATABASE_URL|postgres:\/\/|postgresql:\/\/|token|cookie|password|secret/i
    );
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("keeps dry-run precondition blockers as HTTP 200 read-only reports", async () => {
    const service = createMaintenanceService({
      dryRunReport: blockedReport("PREVIEW_URL_CONFLICT:mebel")
    });

    const response = await request(createApp(service, adminPrincipal()))
      .get("/api/admin/maintenance/canonical-assets")
      .expect(200);

    expect(response.body.data).toMatchObject({
      blockers: ["PREVIEW_URL_CONFLICT:mebel"],
      mode: "dry-run",
      status: "blocked"
    });
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("requires admin RBAC and exact confirmation for apply", async () => {
    const service = createMaintenanceService();

    await request(createApp(service)).post("/api/admin/maintenance/canonical-assets/reconcile").send({
      confirmation: "WEB00-CANONICAL-ASSETS-15-7"
    }).expect(401);
    await request(createApp(service, editorPrincipal())).post("/api/admin/maintenance/canonical-assets/reconcile").send({
      confirmation: "WEB00-CANONICAL-ASSETS-15-7"
    }).expect(403);

    const wrong = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .send({ confirmation: "wrong" })
      .expect(400);

    expect(wrong.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("admin apply uses authenticated actor and current requestId", async () => {
    const service = createMaintenanceService({
      applyReport: {
        ...readyReport(),
        mode: "apply",
        status: "applied",
        totals: { ...readyReport().totals, appliedSiteUpdates: 3 }
      }
    });

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .set("X-Request-Id", "req_http_maintenance")
      .send({ confirmation: "WEB00-CANONICAL-ASSETS-15-7" })
      .expect(200);

    expect(response.body.data.status).toBe("applied");
    expect(service.apply).toHaveBeenCalledWith(
      { confirmation: "WEB00-CANONICAL-ASSETS-15-7" },
      expect.objectContaining({
        actor: expect.objectContaining({ id: adminPrincipal().id, role: "admin" }),
        requestId: "req_http_maintenance"
      })
    );
  });

  it("returns already-reconciled as a safe no-op for repeated apply", async () => {
    const service = createMaintenanceService({
      applyReport: {
        ...readyReport(),
        mode: "apply",
        status: "already-reconciled",
        totals: {
          appliedSiteUpdates: 0,
          plannedGalleryUrlUpdates: 0,
          plannedPreviewUpdates: 0,
          targetSites: 3
        }
      }
    });

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .send({ confirmation: "WEB00-CANONICAL-ASSETS-15-7" })
      .expect(200);

    expect(response.body.data.status).toBe("already-reconciled");
    expect(JSON.stringify(response.body)).not.toMatch(/DATABASE_URL|token|cookie|password/i);
  });

  it("returns HTTP 409 for known apply precondition blockers instead of HTTP 200", async () => {
    const service = createMaintenanceService({
      applyReport: {
        ...blockedReport("CATEGORY_MISMATCH:mebel"),
        mode: "apply"
      }
    });

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .set("X-Request-Id", "req_apply_precondition")
      .send({ confirmation: "WEB00-CANONICAL-ASSETS-15-7" })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "RECONCILIATION_PRECONDITION_FAILED",
      message: "Восстановление не выполнено. Повторите проверку состояния.",
      requestId: "req_apply_precondition"
    });
    expect(JSON.stringify(response.body.error.details)).toContain("CATEGORY_MISMATCH:mebel");
  });

  it("returns HTTP 409 for transaction state changes with the state-changed code", async () => {
    const service = createMaintenanceService({
      applyReport: {
        ...blockedReport("RECONCILIATION_STATE_CHANGED"),
        message: "Данные карточек изменились. Повторите проверку состояния.",
        mode: "apply"
      }
    });

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .set("X-Request-Id", "req_state_changed")
      .send({ confirmation: "WEB00-CANONICAL-ASSETS-15-7" })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "RECONCILIATION_STATE_CHANGED",
      message: "Данные карточек изменились. Повторите проверку состояния.",
      requestId: "req_state_changed"
    });
  });

  it("returns safe HTTP 500 for unexpected apply errors without raw database output", async () => {
    const service = createMaintenanceService({
      applyError: new Error("Prisma transaction failed near postgresql://secret@localhost/db")
    });

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/maintenance/canonical-assets/reconcile")
      .set("X-Request-Id", "req_unexpected_apply")
      .send({ confirmation: "WEB00-CANONICAL-ASSETS-15-7" })
      .expect(500);

    expect(response.body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      requestId: "req_unexpected_apply"
    });
    expect(JSON.stringify(response.body)).not.toMatch(/Prisma|postgresql:\/\/|secret|DATABASE_URL|token|cookie|password/i);
  });
});

function createApp(service: AdminMaintenanceService, principal?: AuthenticatedPrincipal) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((request_, _response, next) => {
    if (principal !== undefined) {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = principal;
    }
    next();
  });
  app.use("/api/admin", createAdminMaintenanceRouter({
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    service
  }));
  app.use(errorHandler);

  return app;
}

function createMaintenanceService(options: {
  applyError?: Error;
  applyReport?: CanonicalAssetReconciliationReport;
  dryRunReport?: CanonicalAssetReconciliationReport;
} = {}): AdminMaintenanceService {
  return {
    apply: vi.fn(async () => {
      if (options.applyError !== undefined) {
        throw options.applyError;
      }

      return options.applyReport ?? readyReport();
    }),
    dryRun: vi.fn(async () => options.dryRunReport ?? readyReport())
  };
}

function readyReport(): CanonicalAssetReconciliationReport {
  return {
    blockers: [],
    mode: "dry-run" as const,
    status: "ready" as const,
    targets: [
      targetReport("mebel"),
      targetReport("massage"),
      targetReport("drova")
    ],
    totals: {
      appliedSiteUpdates: 0,
      plannedGalleryUrlUpdates: 12,
      plannedPreviewUpdates: 3,
      targetSites: 3
    }
  };
}

function targetReport(slug: "mebel" | "massage" | "drova") {
  return {
    active: true,
    blockers: [],
    categoryMatch: true,
    deleted: false,
    found: true,
    galleryCount: 4,
    gallerySourceMatch: true,
    plannedGalleryUrlUpdates: 4,
    plannedPreviewUpdate: true,
    previewState: "missing" as const,
    slug,
    status: "draft",
    titleMatch: true
  };
}

function blockedReport(blocker: string): CanonicalAssetReconciliationReport {
  return {
    ...readyReport(),
    blockers: [blocker],
    status: "blocked",
    targets: [
      {
        ...targetReport("mebel"),
        blockers: blocker.endsWith(":mebel") || blocker === "RECONCILIATION_STATE_CHANGED"
          ? [blocker]
          : []
      },
      targetReport("massage"),
      targetReport("drova")
    ],
    totals: {
      appliedSiteUpdates: 0,
      plannedGalleryUrlUpdates: 0,
      plannedPreviewUpdates: 0,
      targetSites: 3
    }
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
    id: "00000000-0000-4000-8000-000000000004",
    role: "editor"
  };
}
