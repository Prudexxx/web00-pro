import { AppError } from "../../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../../auth/auth.types.js";

export {
  createPagesCatalogPublicationReconciliationWorker,
  createPagesCatalogPublicationService,
  serializeCanonicalCatalogCard,
  type PagesCatalogGitHubProvider,
  type PagesCatalogPublicationDto,
  type PagesCatalogPublicationReconciliationWorker,
  type PagesCatalogPublicationService
} from "./pages-publication.service.js";

export interface AdminPublicationStartInput {
  action: "publish" | "unpublish";
  actor: AuthenticatedPrincipal;
  idempotencyKey: string;
  now: Date;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
}

export interface AdminPublicationDto {
  buttonLabel: string;
  operationId: string;
  retryable: boolean;
  stableStatus: string;
  status: string;
  statusUrl: string;
}

export interface AdminPublicationService {
  getOperation(id: string): Promise<AdminPublicationDto>;
  startPublication(input: AdminPublicationStartInput): Promise<AdminPublicationDto>;
}

export function createAdminPublicationService(): AdminPublicationService {
  return {
    async getOperation() {
      throw legacyPublicationDisabled();
    },
    async startPublication() {
      throw legacyPublicationDisabled();
    }
  };
}

function legacyPublicationDisabled(): AppError {
  return new AppError({
    code: "DIRECT_PAGES_PUBLICATION_REQUIRED",
    message: "Direct Pages publication is required for public catalog lifecycle changes.",
    statusCode: 409
  });
}
