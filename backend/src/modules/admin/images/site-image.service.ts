import { AppError } from "../../../lib/errors.js";
import type { AdminMutationContext } from "../admin.types.js";
import { createPermissionPolicy } from "../rbac.policy.js";
import type { PermissionPolicy } from "../rbac.types.js";
import type { StorageCleanupRepository } from "../../storage-cleanup/storage-cleanup.types.js";
import { buildVariantPath } from "../../images/image-paths.js";
import type {
  AssetUploadCoordinator,
  ImageProcessor,
  ManagedGalleryImage,
  ManagedImageUrlPolicy,
  ParsedImageFile,
  PublicManagedGalleryImage,
  PublicPreviewImage
} from "../../images/image.types.js";
import type { ImageStorage } from "../../images/image-storage.js";
import type {
  GalleryBatchResponse,
  GalleryDeleteInput,
  GalleryImageListResponse,
  GalleryImageResponse,
  GalleryReorderInput,
  ManagedGalleryMutationImage,
  PreviewImageResponse,
  SiteImageMutationInput,
  SiteImageMutationSite,
  SiteImageUploadInput
} from "./site-image.types.js";

export interface SiteImageRepository {
  addGalleryImage(input: {
    context: AdminMutationContext;
    image: ManagedGalleryImage;
    siteId: string;
    uploadReservationIds: string[];
  }): Promise<SiteImageMutationSite>;
  deleteGalleryImage(input: {
    assetId: string;
    cleanupPaths: string[];
    context: AdminMutationContext;
    siteId: string;
  }): Promise<SiteImageMutationSite>;
  deletePreview(input: {
    cleanupPaths: string[];
    context: AdminMutationContext;
    siteId: string;
  }): Promise<SiteImageMutationSite>;
  getSiteForImageMutation(siteId: string): Promise<SiteImageMutationSite | null>;
  replacePreview(input: {
    assetId: string;
    cleanupPaths: string[];
    context: AdminMutationContext;
    previewImageUrl: string;
    siteId: string;
    uploadReservationIds: string[];
  }): Promise<SiteImageMutationSite>;
  reorderGallery(input: {
    context: AdminMutationContext;
    images: ManagedGalleryImage[];
    siteId: string;
  }): Promise<SiteImageMutationSite>;
}

export interface SiteImageService {
  gallery: {
    addBatch(input: {
      context: AdminMutationContext;
      files: ParsedImageFile[];
      siteId: string;
    }): Promise<GalleryBatchResponse>;
    addBatchStream(input: {
      context: AdminMutationContext;
      files: AsyncIterable<ParsedImageFile>;
      signal?: AbortSignal;
      siteId: string;
    }): Promise<GalleryBatchResponse>;
    addSingle(input: SiteImageUploadInput): Promise<GalleryImageResponse>;
    deleteImage(input: GalleryDeleteInput): Promise<GalleryImageListResponse>;
    reorder(input: GalleryReorderInput): Promise<GalleryImageListResponse>;
  };
  preview: {
    deletePreview(input: SiteImageMutationInput): Promise<PreviewImageResponse>;
    replacePreview(input: SiteImageUploadInput): Promise<PreviewImageResponse>;
  };
}

export interface CreateSiteImageServiceOptions {
  cleanup: StorageCleanupRepository;
  coordinator: AssetUploadCoordinator;
  imageUrlPolicy: ManagedImageUrlPolicy;
  processor: ImageProcessor;
  repository: SiteImageRepository;
  storage: ImageStorage;
}

const GALLERY_BATCH_CONCURRENCY = 2;
const GALLERY_BATCH_TIMEOUT_MS = 180_000;

export function createSiteImageService(
  options: CreateSiteImageServiceOptions
): SiteImageService {
  return {
    gallery: {
      addBatch: (input) => addGalleryBatch(options, input),
      addBatchStream: (input) => addGalleryBatchStream(options, input),
      addSingle: (input) => addSingleGallery(options, input),
      deleteImage: (input) => deleteGalleryImage(options, input),
      reorder: (input) => reorderGallery(options, input)
    },
    preview: {
      deletePreview: (input) => deletePreview(options, input),
      replacePreview: (input) => replacePreview(options, input)
    }
  };
}

export function assertCanMutateSiteImages(
  principal: AdminMutationContext["actor"],
  site: SiteImageMutationSite,
  policy: PermissionPolicy = createPermissionPolicy()
): void {
  if (site.deletedAt !== null || !site.active || site.status === "archived") {
    throw siteImageStateForbidden();
  }

  if (site.status === "draft") {
    if (!policy.has(principal.role, "site.updateDraft")) {
      throw forbidden();
    }
    return;
  }

  if (site.status === "published") {
    if (!policy.has(principal.role, "site.updateAny")) {
      throw forbidden();
    }
    return;
  }

  throw siteImageStateForbidden();
}

type GalleryBatchUploadCandidate =
  | {
      failure: GalleryBatchResponse["failed"][number];
      kind: "failed";
    }
  | {
      file: ParsedImageFile;
      image: PublicManagedGalleryImage;
      kind: "replayed";
    }
  | {
      file: ParsedImageFile;
      image: ManagedGalleryMutationImage;
      kind: "uploaded";
      uploadReservationIds: string[];
    };

interface GalleryBatchTimeoutState {
  cancelledError?: AppError;
  timedOut: boolean;
}

async function addGalleryBatch(
  options: CreateSiteImageServiceOptions,
  input: { context: AdminMutationContext; files: ParsedImageFile[]; siteId: string }
): Promise<GalleryBatchResponse> {
  return withGalleryBatchTimeout((timeoutState) =>
    runGalleryBatch(options, input, timeoutState)
  );
}

async function addGalleryBatchStream(
  options: CreateSiteImageServiceOptions,
  input: {
    context: AdminMutationContext;
    files: AsyncIterable<ParsedImageFile>;
    signal?: AbortSignal;
    siteId: string;
  }
): Promise<GalleryBatchResponse> {
  return withGalleryBatchTimeout((timeoutState) =>
    runGalleryBatchStream(options, input, timeoutState)
  );
}

async function runGalleryBatch(
  options: CreateSiteImageServiceOptions,
  input: { context: AdminMutationContext; files: ParsedImageFile[]; siteId: string },
  timeoutState: GalleryBatchTimeoutState
): Promise<GalleryBatchResponse> {
  const sortedFiles = [...input.files].sort((left, right) => left.index - right.index);
  const candidates = await mapWithConcurrency(
    sortedFiles,
    GALLERY_BATCH_CONCURRENCY,
    (file) =>
      prepareGalleryBatchCandidate(options, {
        context: input.context,
        file,
        siteId: input.siteId,
        timeoutState
      })
  );

  return attachGalleryBatchCandidates(options, {
    candidates,
    context: input.context,
    siteId: input.siteId,
    timeoutState
  });
}

async function runGalleryBatchStream(
  options: CreateSiteImageServiceOptions,
  input: {
    context: AdminMutationContext;
    files: AsyncIterable<ParsedImageFile>;
    signal?: AbortSignal;
    siteId: string;
  },
  timeoutState: GalleryBatchTimeoutState
): Promise<GalleryBatchResponse> {
  const limit = createConcurrencyLimiter(GALLERY_BATCH_CONCURRENCY);
  const candidatePromises: Array<Promise<GalleryBatchUploadCandidate>> = [];
  const onAbort = () => {
    cancelGalleryBatch(timeoutState, input.signal?.reason);
  };

  if (input.signal !== undefined) {
    if (input.signal.aborted) {
      onAbort();
    } else {
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    assertGalleryBatchCanContinue(timeoutState);

    for await (const file of input.files) {
      assertGalleryBatchCanContinue(timeoutState);
      candidatePromises.push(
        limit(() => {
          assertGalleryBatchCanContinue(timeoutState);
          return prepareGalleryBatchCandidate(options, {
            context: input.context,
            file,
            siteId: input.siteId,
            timeoutState
          });
        })
      );
    }

    assertGalleryBatchCanContinue(timeoutState);

    const candidates = (await Promise.all(candidatePromises)).sort(
      (left, right) => galleryBatchCandidateIndex(left) - galleryBatchCandidateIndex(right)
    );

    assertGalleryBatchCanContinue(timeoutState);

    return attachGalleryBatchCandidates(options, {
      candidates,
      context: input.context,
      siteId: input.siteId,
      timeoutState
    });
  } catch (error) {
    cancelGalleryBatch(timeoutState, error);
    await Promise.allSettled(candidatePromises);
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }
}

async function attachGalleryBatchCandidates(
  options: CreateSiteImageServiceOptions,
  input: {
    candidates: GalleryBatchUploadCandidate[];
    context: AdminMutationContext;
    siteId: string;
    timeoutState: GalleryBatchTimeoutState;
  }
): Promise<GalleryBatchResponse> {
  const succeeded: GalleryBatchResponse["succeeded"] = [];
  const failed: GalleryBatchResponse["failed"] = [];

  for (const candidate of input.candidates) {
    assertGalleryBatchCanContinue(input.timeoutState);

    if (candidate.kind === "failed") {
      failed.push(candidate.failure);
      continue;
    }

    if (candidate.kind === "replayed") {
      succeeded.push({
        clientFileId: candidate.file.assetId,
        image: candidate.image,
        index: candidate.file.index,
        replayed: true
      });
      continue;
    }

    try {
      const updated = await options.repository.addGalleryImage({
        context: input.context,
        image: candidate.image,
        siteId: input.siteId,
        uploadReservationIds: candidate.uploadReservationIds
      });
      const updatedGallery = parseManagedGallery(
        options.imageUrlPolicy,
        updated.galleryImages,
        updated.id
      );
      const added = updatedGallery.find((item) => item.assetId === candidate.file.assetId);

      if (added === undefined) {
        throw imageNotFound();
      }

      succeeded.push({
        clientFileId: candidate.file.assetId,
        image: toPublicGalleryImage(added, options.imageUrlPolicy, updated.title),
        index: candidate.file.index,
        replayed: false
      });
    } catch (error) {
      failed.push(toGalleryBatchFailure(candidate.file, error));
    }
  }

  return { failed, succeeded };
}

function galleryBatchCandidateIndex(candidate: GalleryBatchUploadCandidate): number {
  return candidate.kind === "failed" ? candidate.failure.index : candidate.file.index;
}

async function prepareGalleryBatchCandidate(
  options: CreateSiteImageServiceOptions,
  input: SiteImageUploadInput & { timeoutState: GalleryBatchTimeoutState }
): Promise<GalleryBatchUploadCandidate> {
  try {
    return await options.coordinator.runExclusive(
      `${input.siteId}:gallery:${input.file.assetId}`,
      async () => {
        assertGalleryBatchCanContinue(input.timeoutState);

        const site = await loadMutationSite(options.repository, input.siteId);

        assertGalleryBatchCanContinue(input.timeoutState);
        assertCanMutateSiteImages(input.context.actor, site);

        const gallery = parseManagedGallery(
          options.imageUrlPolicy,
          site.galleryImages,
          site.id
        );
        const existing = gallery.find((image) => image.assetId === input.file.assetId);

        if (existing !== undefined) {
          return {
            file: input.file,
            image: toPublicGalleryImage(existing, options.imageUrlPolicy, site.title),
            kind: "replayed"
          };
        }

        const preview = parseCurrentPreview(options.imageUrlPolicy, site);

        if (preview?.assetId === input.file.assetId) {
          throw uploadIdConflict();
        }
        if (gallery.length >= 20) {
          throw galleryLimitExceeded();
        }

        assertGalleryBatchCanContinue(input.timeoutState);

        const processed = await options.processor.process({
          assetId: input.file.assetId,
          declaredMimeType: input.file.declaredMimeType,
          siteId: input.siteId,
          slot: "gallery",
          source: input.file.source
        });

        assertGalleryBatchCanContinue(input.timeoutState);

        await cleanUnattachedObjectsBeforeUpload(options, {
          context: input.context,
          paths: processed.variants.map((variant) => variant.path),
          state: input.timeoutState,
          siteId: input.siteId
        });

        assertGalleryBatchCanContinue(input.timeoutState);

        const reservations = await options.cleanup.createUploadReservations({
          entityId: input.siteId,
          paths: processed.variants.map((variant) => variant.path),
          runAfter: addMinutes(input.context.now, 15)
        });

        for (const variant of processed.variants) {
          assertGalleryBatchCanContinue(input.timeoutState);

          await options.storage.uploadObject({
            body: variant.body,
            cacheControl: "31536000",
            contentType: variant.contentType,
            path: variant.path,
            upsert: false
          });

          assertGalleryBatchCanContinue(input.timeoutState);
        }

        assertGalleryBatchCanContinue(input.timeoutState);

        return {
          file: input.file,
          image: buildManagedGalleryImage(options, {
            file: input.file,
            galleryLength: gallery.length,
            processed,
            siteId: input.siteId
          }),
          kind: "uploaded",
          uploadReservationIds: reservations.map((reservation) => reservation.id)
        };
      }
    );
  } catch (error) {
    return {
      failure: toGalleryBatchFailure(input.file, error),
      kind: "failed"
    };
  }
}

async function replacePreview(
  options: CreateSiteImageServiceOptions,
  input: SiteImageUploadInput
): Promise<PreviewImageResponse> {
  return options.coordinator.runExclusive(
    `${input.siteId}:preview:${input.file.assetId}`,
    async () => {
      const site = await loadMutationSite(options.repository, input.siteId);

      assertCanMutateSiteImages(input.context.actor, site);

      const currentPreview = parseCurrentPreview(options.imageUrlPolicy, site);

      if (currentPreview?.assetId === input.file.assetId) {
        return {
          previewImage: toPublicPreview(currentPreview, options.imageUrlPolicy),
          replaced: false,
          replayed: true
        };
      }
      if (
        galleryHasAsset(
          options.imageUrlPolicy,
          site.galleryImages,
          input.file.assetId,
          input.siteId
        )
      ) {
        throw uploadIdConflict();
      }

      const processed = await options.processor.process({
        assetId: input.file.assetId,
        declaredMimeType: input.file.declaredMimeType,
        siteId: input.siteId,
        slot: "preview",
        source: input.file.source
      });
      await cleanUnattachedObjectsBeforeUpload(options, {
        context: input.context,
        paths: processed.variants.map((variant) => variant.path),
        siteId: input.siteId
      });
      const reservationRunAfter = addMinutes(input.context.now, 15);
      const reservations = await options.cleanup.createUploadReservations({
        entityId: input.siteId,
        paths: processed.variants.map((variant) => variant.path),
        runAfter: reservationRunAfter
      });
      const uploaded = [];

      for (const variant of processed.variants) {
        uploaded.push(
          await options.storage.uploadObject({
            body: variant.body,
            cacheControl: "31536000",
            contentType: variant.contentType,
            path: variant.path,
            upsert: false
          })
        );
      }

      const largestWidth = Math.max(...processed.widths);
      const previewImageUrl = uploaded.find(
        (upload) => upload.path.endsWith(`/${largestWidth}.webp`)
      )?.publicUrl;

      if (previewImageUrl === undefined) {
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Internal server error.",
          statusCode: 500
        });
      }

      const updated = await options.repository.replacePreview({
        assetId: input.file.assetId,
        cleanupPaths:
          currentPreview === null
            ? []
            : buildCleanupPaths(currentPreview.storagePath, currentPreview.widths),
        context: input.context,
        previewImageUrl,
        siteId: input.siteId,
        uploadReservationIds: reservations.map((reservation) => reservation.id)
      });
      const preview = parseCurrentPreview(options.imageUrlPolicy, updated);

      return {
        previewImage: preview === null ? null : toPublicPreview(preview, options.imageUrlPolicy),
        replaced: currentPreview !== null,
        replayed: false
      };
    }
  );
}

async function deletePreview(
  options: CreateSiteImageServiceOptions,
  input: SiteImageMutationInput
): Promise<PreviewImageResponse> {
  const site = await loadMutationSite(options.repository, input.siteId);

  assertCanMutateSiteImages(input.context.actor, site);

  if (site.status === "published") {
    throw sitePreviewRequired();
  }

  const preview = parseCurrentPreview(options.imageUrlPolicy, site);

  if (site.previewImageUrl === null || site.previewImageUrl.trim() === "") {
    throw imageNotFound();
  }

  await options.repository.deletePreview({
    cleanupPaths: preview === null ? [] : buildCleanupPaths(preview.storagePath, preview.widths),
    context: input.context,
    siteId: input.siteId
  });

  return {
    previewImage: null,
    replaced: true,
    replayed: false
  };
}

async function addSingleGallery(
  options: CreateSiteImageServiceOptions,
  input: SiteImageUploadInput
): Promise<GalleryImageResponse> {
  return options.coordinator.runExclusive(
    `${input.siteId}:gallery:${input.file.assetId}`,
    async () => {
      const site = await loadMutationSite(options.repository, input.siteId);

      assertCanMutateSiteImages(input.context.actor, site);

      const gallery = parseManagedGallery(options.imageUrlPolicy, site.galleryImages, site.id);
      const existing = gallery.find((image) => image.assetId === input.file.assetId);

      if (existing !== undefined) {
        return {
          image: toPublicGalleryImage(existing, options.imageUrlPolicy, site.title),
          replayed: true
        };
      }

      const preview = parseCurrentPreview(options.imageUrlPolicy, site);

      if (preview?.assetId === input.file.assetId) {
        throw uploadIdConflict();
      }
      if (gallery.length >= 20) {
        throw galleryLimitExceeded();
      }

      const processed = await options.processor.process({
        assetId: input.file.assetId,
        declaredMimeType: input.file.declaredMimeType,
        siteId: input.siteId,
        slot: "gallery",
        source: input.file.source
      });
      await cleanUnattachedObjectsBeforeUpload(options, {
        context: input.context,
        paths: processed.variants.map((variant) => variant.path),
        siteId: input.siteId
      });
      const reservations = await options.cleanup.createUploadReservations({
        entityId: input.siteId,
        paths: processed.variants.map((variant) => variant.path),
        runAfter: addMinutes(input.context.now, 15)
      });

      for (const variant of processed.variants) {
        await options.storage.uploadObject({
          body: variant.body,
          cacheControl: "31536000",
          contentType: variant.contentType,
          path: variant.path,
          upsert: false
        });
      }

      const image = buildManagedGalleryImage(options, {
        file: input.file,
        galleryLength: gallery.length,
        processed,
        siteId: input.siteId
      });
      const updated = await options.repository.addGalleryImage({
        context: input.context,
        image,
        siteId: input.siteId,
        uploadReservationIds: reservations.map((reservation) => reservation.id)
      });
      const updatedGallery = parseManagedGallery(
        options.imageUrlPolicy,
        updated.galleryImages,
        updated.id
      );
      const added = updatedGallery.find((item) => item.assetId === input.file.assetId);

      if (added === undefined) {
        throw imageNotFound();
      }

      return {
        image: toPublicGalleryImage(added, options.imageUrlPolicy, updated.title),
        replayed: false
      };
    }
  );
}

async function reorderGallery(
  options: CreateSiteImageServiceOptions,
  input: GalleryReorderInput
): Promise<GalleryImageListResponse> {
  const site = await loadMutationSite(options.repository, input.siteId);

  assertCanMutateSiteImages(input.context.actor, site);

  const gallery = parseManagedGallery(options.imageUrlPolicy, site.galleryImages, site.id);
  const byAsset = new Map(gallery.map((image) => [image.assetId, image]));

  if (input.items.length !== gallery.length) {
    throw galleryDataInvalid();
  }

  const seen = new Set<string>();
  const reordered: ManagedGalleryMutationImage[] = input.items.map((item, index) => {
    const existing = byAsset.get(item.assetId);

    if (existing === undefined || seen.has(item.assetId)) {
      throw galleryDataInvalid();
    }
    seen.add(item.assetId);

    return {
      ...existing,
      alt: item.alt?.trim() ?? existing.alt,
      sortOrder: index
    };
  });

  const updated = await options.repository.reorderGallery({
    context: input.context,
    images: reordered,
    siteId: input.siteId
  });

  return {
    images: parseManagedGallery(
      options.imageUrlPolicy,
      updated.galleryImages,
      updated.id
    ).map((image) => toPublicGalleryImage(image, options.imageUrlPolicy, updated.title))
  };
}

async function deleteGalleryImage(
  options: CreateSiteImageServiceOptions,
  input: GalleryDeleteInput
): Promise<GalleryImageListResponse> {
  const site = await loadMutationSite(options.repository, input.siteId);

  assertCanMutateSiteImages(input.context.actor, site);

  const gallery = parseManagedGallery(options.imageUrlPolicy, site.galleryImages, site.id);
  const existing = gallery.find((image) => image.assetId === input.assetId);

  if (existing === undefined) {
    throw imageNotFound();
  }

  const updated = await options.repository.deleteGalleryImage({
    assetId: input.assetId,
    cleanupPaths: buildCleanupPaths(existing.storagePath, existing.widths),
    context: input.context,
    siteId: input.siteId
  });

  return {
    images: parseManagedGallery(
      options.imageUrlPolicy,
      updated.galleryImages,
      updated.id
    ).map((image) => toPublicGalleryImage(image, options.imageUrlPolicy, updated.title))
  };
}

async function withGalleryBatchTimeout<T>(
  operation: (timeoutState: GalleryBatchTimeoutState) => Promise<T>
): Promise<T> {
  const timeoutState = { timedOut: false };
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timeoutState.timedOut = true;
      reject(imageProcessingTimeout());
    }, GALLERY_BATCH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation(timeoutState), timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  mapper: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;

        nextIndex += 1;
        results[index] = await mapper(items[index] as TItem);
      }
    }
  );

  await Promise.all(workers);

  return results;
}

function createConcurrencyLimiter(concurrency: number): <T>(operation: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
    active += 1;
  }

  function release(): void {
    active -= 1;
    waiting.shift()?.();
  }

  return async (operation) => {
    await acquire();

    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function buildManagedGalleryImage(
  options: CreateSiteImageServiceOptions,
  input: {
    file: ParsedImageFile;
    galleryLength: number;
    processed: Awaited<ReturnType<ImageProcessor["process"]>>;
    siteId: string;
  }
): ManagedGalleryMutationImage {
  const storagePath = `sites/${input.siteId}/gallery/${input.file.assetId}`;
  const largestWidth = Math.max(...input.processed.widths);

  return {
    alt: input.file.alt.trim(),
    assetId: input.file.assetId,
    sortOrder: input.galleryLength,
    storagePath: storagePath as `sites/${string}/gallery/${string}`,
    url: options.storage.getPublicUrl(buildVariantPath(storagePath, largestWidth, "webp")),
    widths: input.processed.widths
  };
}

async function cleanUnattachedObjectsBeforeUpload(
  options: CreateSiteImageServiceOptions,
  input: {
    context: AdminMutationContext;
    paths: string[];
    state?: GalleryBatchTimeoutState;
    siteId: string;
  }
): Promise<void> {
  assertGalleryBatchCanContinue(input.state);
  const firstInspection = await options.storage.inspectObjects(input.paths);

  assertGalleryBatchCanContinue(input.state);

  if (firstInspection.existingPaths.length === 0) {
    return;
  }

  await options.cleanup.createJobs(
    firstInspection.existingPaths.map((path) => ({
      entityId: input.siteId,
      entityType: "site_image",
      reason: "partial_upload_retry",
      runAfter: input.context.now,
      storagePath: path
    }))
  );
  assertGalleryBatchCanContinue(input.state);
  await options.storage.removeObjects(firstInspection.existingPaths);

  assertGalleryBatchCanContinue(input.state);
  const secondInspection = await options.storage.inspectObjects(input.paths);

  assertGalleryBatchCanContinue(input.state);

  if (secondInspection.existingPaths.length > 0) {
    throw storageCleanupDeferred();
  }
}

function assertGalleryBatchCanContinue(timeoutState?: GalleryBatchTimeoutState): void {
  if (timeoutState?.cancelledError !== undefined) {
    throw timeoutState.cancelledError;
  }
  if (timeoutState?.timedOut === true) {
    throw imageProcessingTimeout();
  }
}

function cancelGalleryBatch(timeoutState: GalleryBatchTimeoutState, error: unknown): void {
  if (timeoutState.cancelledError === undefined) {
    timeoutState.cancelledError = toGalleryBatchCancellationError(error);
  }
}

function toGalleryBatchCancellationError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    code: "VALIDATION_ERROR",
    message: "Invalid multipart request.",
    statusCode: 400
  });
}

function toGalleryBatchFailure(
  file: ParsedImageFile,
  error: unknown
): GalleryBatchResponse["failed"][number] {
  return {
    clientFileId: file.assetId,
    code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
    index: file.index,
    message: error instanceof AppError ? error.message : "Internal server error."
  };
}

async function loadMutationSite(
  repository: SiteImageRepository,
  siteId: string
): Promise<SiteImageMutationSite> {
  const site = await repository.getSiteForImageMutation(siteId);

  if (site === null) {
    throw new AppError({
      code: "SITE_NOT_FOUND",
      message: "Site not found.",
      statusCode: 404
    });
  }

  return site;
}

function parseCurrentPreview(
  policy: ManagedImageUrlPolicy,
  site: SiteImageMutationSite
) {
  if (site.previewImageUrl === null || site.previewImageUrl.trim() === "") {
    return null;
  }

  return policy.parseManagedPreview(site.id, site.previewImageUrl);
}

function toPublicPreview(
  preview: NonNullable<ReturnType<ManagedImageUrlPolicy["parseManagedPreview"]>>,
  policy: ManagedImageUrlPolicy
): PublicPreviewImage {
  return {
    assetId: preview.assetId,
    url: preview.url,
    variants: policy.buildVariants(preview)
  };
}

function parseManagedGallery(
  policy: ManagedImageUrlPolicy,
  value: unknown,
  siteId: string
): ManagedGalleryMutationImage[] {
  if (!Array.isArray(value)) {
    throw galleryDataInvalid();
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw galleryDataInvalid();
    }

    const record = item as Record<string, unknown>;

    if (
      typeof record.assetId !== "string" ||
      typeof record.storagePath !== "string" ||
      typeof record.url !== "string" ||
      typeof record.alt !== "string"
    ) {
      throw galleryDataInvalid();
    }

    const managed = policy.parseManagedGallery(siteId, record.url);

    if (
      managed === null ||
      managed.assetId !== record.assetId ||
      managed.storagePath !== record.storagePath
    ) {
      throw galleryDataInvalid();
    }

    return {
      alt: record.alt,
      assetId: record.assetId,
      sortOrder: Number.isInteger(record.sortOrder) ? Number(record.sortOrder) : index,
      storagePath: managed.storagePath as `sites/${string}/gallery/${string}`,
      url: managed.url,
      widths: managed.widths
    };
  });
}

function galleryHasAsset(
  policy: ManagedImageUrlPolicy,
  value: unknown,
  assetId: string,
  siteId: string
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  try {
    return parseManagedGallery(policy, value, siteId).some(
      (image) => image.assetId === assetId
    );
  } catch {
    return false;
  }
}

function toPublicGalleryImage(
  image: ManagedGalleryMutationImage,
  policy: ManagedImageUrlPolicy,
  siteTitle: string
): PublicManagedGalleryImage {
  const descriptor = {
    assetId: image.assetId,
    siteId: image.storagePath.split("/")[1] ?? "",
    slot: "gallery" as const,
    storagePath: image.storagePath,
    url: image.url,
    widths: image.widths
  };

  return {
    alt: image.alt.trim() === "" ? siteTitle : image.alt,
    assetId: image.assetId,
    sortOrder: image.sortOrder,
    storagePath: image.storagePath,
    url: image.url,
    variants: policy.buildVariants(descriptor)
  };
}

function buildCleanupPaths(storagePath: string, widths: readonly number[]): string[] {
  return widths.flatMap((width) => [
    buildVariantPath(storagePath, width, "webp"),
    buildVariantPath(storagePath, width, "avif")
  ]);
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

function forbidden(): AppError {
  return new AppError({
    code: "FORBIDDEN",
    message: "Forbidden.",
    statusCode: 403
  });
}

function siteImageStateForbidden(): AppError {
  return new AppError({
    code: "SITE_IMAGE_STATE_FORBIDDEN",
    message: "Site image state is forbidden.",
    statusCode: 409
  });
}

function sitePreviewRequired(): AppError {
  return new AppError({
    code: "SITE_PREVIEW_REQUIRED",
    message: "Site preview is required.",
    statusCode: 409
  });
}

function imageNotFound(): AppError {
  return new AppError({
    code: "IMAGE_NOT_FOUND",
    message: "Image not found.",
    statusCode: 404
  });
}

function uploadIdConflict(): AppError {
  return new AppError({
    code: "UPLOAD_ID_CONFLICT",
    message: "Upload id conflicts with another image slot.",
    statusCode: 409
  });
}

function galleryLimitExceeded(): AppError {
  return new AppError({
    code: "GALLERY_LIMIT_EXCEEDED",
    message: "Gallery image limit exceeded.",
    statusCode: 409
  });
}

function galleryDataInvalid(): AppError {
  return new AppError({
    code: "GALLERY_DATA_INVALID",
    message: "Gallery image data is invalid.",
    statusCode: 409
  });
}

function imageProcessingTimeout(): AppError {
  return new AppError({
    code: "IMAGE_PROCESSING_TIMEOUT",
    message: "Image processing timed out.",
    statusCode: 504
  });
}

function storageCleanupDeferred(): AppError {
  return new AppError({
    code: "STORAGE_CLEANUP_DEFERRED",
    message: "Storage cleanup is deferred.",
    statusCode: 503
  });
}
