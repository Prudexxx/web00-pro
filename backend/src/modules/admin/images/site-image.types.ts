import type { AdminMutationContext } from "../admin.types.js";
import type {
  ManagedGalleryImage,
  ParsedImageFile,
  PublicManagedGalleryImage,
  PublicPreviewImage
} from "../../images/image.types.js";

export interface SiteImageMutationSite {
  active: boolean;
  deletedAt: Date | null;
  galleryImages: unknown;
  id: string;
  previewImageUrl: string | null;
  status: string;
  title: string;
}

export interface SiteImageUploadInput {
  context: AdminMutationContext;
  file: ParsedImageFile;
  siteId: string;
}

export interface SiteImageMutationInput {
  context: AdminMutationContext;
  siteId: string;
}

export interface PreviewImageResponse {
  previewImage: PublicPreviewImage | null;
  replaced: boolean;
  replayed: boolean;
}

export interface GalleryImageResponse {
  image: PublicManagedGalleryImage;
  replayed: boolean;
}

export interface GalleryImageListResponse {
  images: PublicManagedGalleryImage[];
}

export interface GalleryReorderItem {
  alt?: string;
  assetId: string;
  sortOrder: number;
}

export interface GalleryReorderInput extends SiteImageMutationInput {
  items: GalleryReorderItem[];
}

export interface GalleryDeleteInput extends SiteImageMutationInput {
  assetId: string;
}

export type GalleryBatchResponse = {
  failed: Array<{
    clientFileId: string | null;
    code: string;
    index: number;
    message: string;
    requestId?: string;
  }>;
  succeeded: Array<{
    clientFileId: string;
    image: PublicManagedGalleryImage;
    index: number;
    replayed: boolean;
  }>;
};

export interface PreviewImageService {
  deletePreview(input: SiteImageMutationInput): Promise<PreviewImageResponse>;
  replacePreview(input: SiteImageUploadInput): Promise<PreviewImageResponse>;
}

export interface GalleryImageService {
  addBatch(input: { context: AdminMutationContext; files: ParsedImageFile[]; siteId: string }): Promise<GalleryBatchResponse>;
  addBatchStream(input: {
    context: AdminMutationContext;
    files: AsyncIterable<ParsedImageFile>;
    signal?: AbortSignal;
    siteId: string;
  }): Promise<GalleryBatchResponse>;
  addSingle(input: SiteImageUploadInput): Promise<GalleryImageResponse>;
  deleteImage(input: GalleryDeleteInput): Promise<GalleryImageListResponse>;
  reorder(input: GalleryReorderInput): Promise<GalleryImageListResponse>;
}

export type ManagedGalleryMutationImage = ManagedGalleryImage & {
  widths: number[];
};
