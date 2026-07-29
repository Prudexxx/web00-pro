import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { assertCanUpdateSite } from "../src/modules/admin/sites/site.service.js";
import type { UpdateAdminSiteInput } from "../src/modules/admin/sites/site.types.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";

describe("admin site update permission helper", () => {
  it("allows editor draft content updates and denies editor published updates", () => {
    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "draft" }, {
        title: "Draft"
      })
    ).not.toThrow();

    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "published" }, {
        title: "Published"
      })
    ).toThrow(AppError);
  });

  it("requires site.updateAny for featured updates", () => {
    expect(() =>
      assertCanUpdateSite(editorPrincipal(), { deletedAt: null, status: "draft" }, {
        featured: true
      } as UpdateAdminSiteInput)
    ).toThrow(AppError);
    expect(() =>
      assertCanUpdateSite(adminPrincipal(), { deletedAt: null, status: "published" }, {
        featured: true
      } as UpdateAdminSiteInput)
    ).not.toThrow();
  });

  it("requires a preview before publishing", () => {
    const error = new AppError({
      code: "SITE_PREVIEW_REQUIRED",
      message: "Site preview is required.",
      statusCode: 409
    });

    expect(error.code).toBe("SITE_PREVIEW_REQUIRED");
  });
});

function editorPrincipal(): AuthenticatedPrincipal {
  return {
    email: "editor@example.com",
    id: "00000000-0000-4000-8000-000000000001",
    role: "editor",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}

function adminPrincipal(): AuthenticatedPrincipal {
  return {
    ...editorPrincipal(),
    email: "admin@example.com",
    role: "admin"
  };
}
