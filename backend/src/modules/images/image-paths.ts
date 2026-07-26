import type {
  ImageSlot,
  ManagedGalleryDescriptor,
  ManagedImageDescriptor,
  ManagedImageUrlPolicy,
  ManagedPreviewDescriptor,
  OutputFormat,
  PublicImageVariant
} from "./image.types.js";
import { selectVariantWidths } from "./image-variants.js";

export interface ManagedImageUrlPolicyOptions {
  bucket: string;
  publicBaseUrl: string;
}

export interface ParseManagedPreviewUrlInput extends ManagedImageUrlPolicyOptions {
  siteId: string;
  url: string;
}

export type ParseManagedGalleryUrlInput = ParseManagedPreviewUrlInput;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const basePathPattern = new RegExp(
  `^sites/(${uuidPattern.source.slice(1, -1)})/(preview|gallery)/(${uuidPattern.source.slice(
    1,
    -1
  )})$`
);

export function buildImageBasePath(
  siteId: string,
  slot: ImageSlot,
  assetId: string
): string {
  assertUuid(siteId, "siteId");
  assertImageSlot(slot);
  assertUuid(assetId, "assetId");

  return `sites/${siteId}/${slot}/${assetId}`;
}

export function buildVariantPath(
  basePath: string,
  width: number,
  format: OutputFormat
): string {
  assertCanonicalBasePath(basePath);
  assertPositiveWidth(width);
  assertOutputFormat(format);

  return `${basePath}/${width}.${format}`;
}

export function createManagedImageUrlPolicy(
  options: ManagedImageUrlPolicyOptions
): ManagedImageUrlPolicy {
  return {
    buildVariants(input) {
      return buildPublicVariants(input, options);
    },
    parseManagedGallery(siteId, url) {
      return parseManagedGalleryUrl({ ...options, siteId, url });
    },
    parseManagedPreview(siteId, url) {
      return parseManagedPreviewUrl({ ...options, siteId, url });
    }
  };
}

export function parseManagedPreviewUrl(
  input: ParseManagedPreviewUrlInput
): ManagedPreviewDescriptor | null {
  const parsed = parseManagedVariantUrl(input, "preview");

  if (parsed === null || parsed.slot !== "preview" || parsed.format !== "webp") {
    return null;
  }

  return {
    assetId: parsed.assetId,
    siteId: parsed.siteId,
    slot: "preview",
    storagePath: buildImageBasePath(parsed.siteId, "preview", parsed.assetId),
    url: input.url,
    widths: selectVariantWidths(parsed.width)
  };
}

export function parseManagedGalleryUrl(
  input: ParseManagedGalleryUrlInput
): ManagedGalleryDescriptor | null {
  const parsed = parseManagedVariantUrl(input, "gallery");

  if (parsed === null || parsed.slot !== "gallery" || parsed.format !== "webp") {
    return null;
  }

  return {
    assetId: parsed.assetId,
    siteId: parsed.siteId,
    slot: "gallery",
    storagePath: buildImageBasePath(parsed.siteId, "gallery", parsed.assetId),
    url: input.url,
    widths: selectVariantWidths(parsed.width)
  };
}

function buildPublicVariants(
  input: ManagedImageDescriptor,
  options: ManagedImageUrlPolicyOptions
): PublicImageVariant[] {
  return input.widths.map((width) => ({
    avifUrl: buildPublicObjectUrl(options, buildVariantPath(input.storagePath, width, "avif")),
    webpUrl: buildPublicObjectUrl(options, buildVariantPath(input.storagePath, width, "webp")),
    width
  }));
}

function buildPublicObjectUrl(
  options: ManagedImageUrlPolicyOptions,
  path: string
): string {
  const publicBaseUrl = normalizeOrigin(options.publicBaseUrl);

  return `${publicBaseUrl}/storage/v1/object/public/${options.bucket}/${path}`;
}

interface ParsedManagedVariantUrl {
  assetId: string;
  format: OutputFormat;
  siteId: string;
  slot: ImageSlot;
  width: number;
}

function parseManagedVariantUrl(
  input: ParseManagedPreviewUrlInput,
  expectedSlot: ImageSlot
): ParsedManagedVariantUrl | null {
  let url: URL;

  try {
    url = new URL(input.url);
  } catch {
    return null;
  }

  if (
    url.origin !== normalizeOrigin(input.publicBaseUrl) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (
    segments.length !== 10 ||
    segments[0] !== "storage" ||
    segments[1] !== "v1" ||
    segments[2] !== "object" ||
    segments[3] !== "public" ||
    segments[4] !== input.bucket ||
    segments[5] !== "sites" ||
    segments[7] !== expectedSlot
  ) {
    return null;
  }

  const siteId = segments[6];
  const assetId = segments[8];
  const filename = segments[9];

  if (siteId !== input.siteId || !isUuid(siteId) || !isUuid(assetId)) {
    return null;
  }

  const match = /^([1-9]\d*)\.(webp|avif)$/.exec(filename ?? "");

  if (match === null) {
    return null;
  }

  return {
    assetId,
    format: match[2] as OutputFormat,
    siteId,
    slot: expectedSlot,
    width: Number(match[1])
  };
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);

  return url.origin;
}

function assertUuid(value: string, label: string): void {
  if (!isUuid(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function assertImageSlot(value: string): asserts value is ImageSlot {
  if (value !== "preview" && value !== "gallery") {
    throw new Error("slot must be preview or gallery.");
  }
}

function assertOutputFormat(value: string): asserts value is OutputFormat {
  if (value !== "webp" && value !== "avif") {
    throw new Error("format must be webp or avif.");
  }
}

function assertPositiveWidth(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("width must be a positive integer.");
  }
}

function assertCanonicalBasePath(value: string): void {
  if (!basePathPattern.test(value)) {
    throw new Error("basePath must be canonical.");
  }
}
