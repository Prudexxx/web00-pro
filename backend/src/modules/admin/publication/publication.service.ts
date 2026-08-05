import { AppError } from "../../../lib/errors.js";
import type { AuthenticatedPrincipal } from "../../auth/auth.types.js";
import type { PublicationOperationRecord } from "../../public-catalog-v2/public-catalog-v2.types.js";
import {
  mapPublicationOperationToDto,
  toPublicationAppError,
  type PublicationOperationDto
} from "../../public-catalog-v2/public-catalog-v2.publication.js";
export {
  createPagesCatalogPublicationReconciliationWorker,
  createPagesCatalogPublicationService,
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

export interface AdminPublicationRepository {
  getOperation(id: string): Promise<PublicationOperationRecord | null>;
  startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationRecord>;
}

export interface AdminPublicationService {
  getOperation(id: string): Promise<PublicationOperationDto>;
  startPublication(input: AdminPublicationStartInput): Promise<PublicationOperationDto>;
}

export function createAdminPublicationService(options: {
  repository: AdminPublicationRepository;
}): AdminPublicationService {
  return {
    async getOperation(id) {
      const operation = await options.repository.getOperation(id);
      if (operation === null) {
        throw new AppError({
          code: "SITE_NOT_FOUND",
          message: "Publication operation not found.",
          statusCode: 404
        });
      }

      return mapPublicationOperationToDto(operation);
    },

    async startPublication(input) {
      try {
        return mapPublicationOperationToDto(await options.repository.startPublication(input));
      } catch (error) {
        throw toPublicationAppError(error);
      }
    }
  };
}
