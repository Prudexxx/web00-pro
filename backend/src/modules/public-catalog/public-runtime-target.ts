import { createPublicRuntimePathBuilder } from "./public-runtime-storage.js";

export type PublicRuntimeProvider = "cloudru";
export type PublicRuntimeRole = "primary" | "shadow";

export interface PublicRuntimeTargetConfig {
  bucket: string;
  catalogVersion: "v1";
  manifestPath: string;
  prefix: string;
  provider: PublicRuntimeProvider;
  publicBaseUrl: string;
  role: PublicRuntimeRole;
}

export function createPublicRuntimeTargetKey(target: PublicRuntimeTargetConfig): string {
  const builder = createPublicRuntimePathBuilder({
    prefix: target.prefix,
    publicBaseUrl: target.publicBaseUrl
  });
  const manifestPath = builder.validatePath(target.manifestPath);
  const publicBaseUrl = new URL(target.publicBaseUrl);
  publicBaseUrl.search = "";
  publicBaseUrl.hash = "";

  return [
    `provider=${target.provider}`,
    `bucket=${target.bucket}`,
    `publicBaseUrl=${publicBaseUrl.href.replace(/\/+$/, "")}`,
    `role=${target.role}`,
    `prefix=${target.prefix}`,
    `catalog=${target.catalogVersion}`,
    `manifest=${manifestPath}`
  ].join(";");
}

export function isSamePublicRuntimeTarget(left: string | null, right: string): boolean {
  return typeof left === "string" && left === right;
}
