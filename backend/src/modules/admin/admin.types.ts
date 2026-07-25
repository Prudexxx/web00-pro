import type { Request } from "express";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";

export interface AdminRequest extends Request {
  auth: AuthenticatedPrincipal;
}

export interface AdminMutationContext {
  actor: AuthenticatedPrincipal;
  now: Date;
  requestId: string;
}

export interface AdminPaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}
