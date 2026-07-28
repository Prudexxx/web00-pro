import { describe, expect, it } from "vitest";
import type { StorageConfig } from "../src/config/storage-env.js";
import type { UploadImageObjectInput } from "../src/modules/images/image-storage.js";
import { createSupabaseImageStorage } from "../src/modules/images/supabase-image-storage.js";

const config: StorageConfig = {
  bucket: "web00-catalog-images",
  credentials: {
    serviceRoleKey: "service-role-secret",
    supabaseUrl: "https://project.supabase.co"
  },
  publicBaseUrl: "https://storage.example.test",
  workerEnabled: false,
  workerPollIntervalSeconds: 60
};

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

function variantPath(width: number, format: "avif" | "webp"): string {
  return `sites/${siteId}/preview/${assetId}/${width}.${format}`;
}

describe("createSupabaseImageStorage", () => {
  it("preserves Supabase storage client receivers for bucket inspection and creation", async () => {
    const calls: string[] = [];
    const storageClient = {
      async createBucket(
        this: unknown,
        bucket: string,
        options: {
          allowedMimeTypes: string[];
          fileSizeLimit: number;
          public: boolean;
        }
      ) {
        if (this !== storageClient) {
          throw new TypeError("UNBOUND_METHOD");
        }

        calls.push(`createBucket:${bucket}:${options.allowedMimeTypes.join(",")}`);
        return { data: {}, error: null };
      },
      from() {
        throw new Error("bucket client should not be used");
      },
      async getBucket(this: unknown, bucket: string) {
        if (this !== storageClient) {
          throw new TypeError("UNBOUND_METHOD");
        }

        calls.push(`getBucket:${bucket}`);
        return {
          data: {
            allowed_mime_types: ["image/webp", "image/avif"],
            file_size_limit: 5 * 1024 * 1024,
            public: true
          },
          error: null
        };
      }
    };
    const storage = createSupabaseImageStorage(config, { storage: storageClient });

    await expect(storage.inspectBucket(config.bucket)).resolves.toEqual({
      compatible: true,
      exists: true
    });
    await expect(
      storage.createBucket({
        allowedMimeTypes: ["image/webp", "image/avif"],
        fileSizeLimit: 5 * 1024 * 1024,
        id: config.bucket,
        public: true
      })
    ).resolves.toEqual({ created: true });
    expect(calls).toEqual([
      "getBucket:web00-catalog-images",
      "createBucket:web00-catalog-images:image/webp,image/avif"
    ]);
  });

  it("preserves Supabase bucket client receivers for list, remove, and upload", async () => {
    const calls: string[] = [];
    const bucketClient = {
      getPublicUrl(path: string) {
        return {
          data: {
            publicUrl: `${config.publicBaseUrl}/storage/v1/object/public/${config.bucket}/${path}`
          }
        };
      },
      async list(this: unknown, prefix: string) {
        if (this !== bucketClient) {
          throw new TypeError("UNBOUND_METHOD");
        }

        calls.push(`list:${prefix}`);
        return { data: [{ name: "480.webp" }], error: null };
      },
      async remove(this: unknown, paths: string[]) {
        if (this !== bucketClient) {
          throw new TypeError("UNBOUND_METHOD");
        }

        calls.push(`remove:${paths.join(",")}`);
        return { data: {}, error: null };
      },
      async upload(
        this: unknown,
        path: string,
        _body: Buffer,
        options: {
          cacheControl: "31536000";
          contentType: "image/avif" | "image/webp";
          upsert: false;
        }
      ) {
        if (this !== bucketClient) {
          throw new TypeError("UNBOUND_METHOD");
        }

        calls.push(`upload:${path}:${options.contentType}`);
        return { data: {}, error: null };
      }
    };
    const storage = createSupabaseImageStorage(config, {
      storage: {
        from(bucket: string) {
          expect(bucket).toBe(config.bucket);
          return bucketClient;
        }
      }
    });

    await expect(storage.inspectObjects([variantPath(480, "webp")])).resolves.toEqual({
      existingPaths: [variantPath(480, "webp")],
      missingPaths: []
    });
    await expect(storage.removeObjects([variantPath(480, "webp")])).resolves.toEqual({
      removedPaths: [variantPath(480, "webp")]
    });
    await expect(
      storage.uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        path: variantPath(480, "webp"),
        upsert: false
      })
    ).resolves.toEqual({
      path: variantPath(480, "webp"),
      publicUrl:
        "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/480.webp"
    });
    expect(calls).toEqual([
      `list:sites/${siteId}/preview/${assetId}`,
      `remove:${variantPath(480, "webp")}`,
      `upload:${variantPath(480, "webp")}:image/webp`
    ]);
  });

  it("uploads immutable generated objects with exact safe options", async () => {
    const uploads: Array<{
      body: Buffer;
      bucket: string;
      options: unknown;
      path: string;
    }> = [];
    const storage = createSupabaseImageStorage(config, {
      storage: {
        from(bucket: string) {
          return {
            async upload(path: string, body: Buffer, options: unknown) {
              uploads.push({ body, bucket, options, path });
              return { data: { path }, error: null };
            },
            getPublicUrl(path: string) {
              return {
                data: {
                  publicUrl: `${config.publicBaseUrl}/storage/v1/object/public/${config.bucket}/${path}`
                }
              };
            }
          };
        }
      }
    });

    await expect(
      storage.uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        path: variantPath(480, "webp"),
        upsert: false
      })
    ).resolves.toEqual({
      path: variantPath(480, "webp"),
      publicUrl:
        "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/480.webp"
    });
    expect(uploads).toEqual([
      {
        body: Buffer.from("webp"),
        bucket: "web00-catalog-images",
        options: {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false
        },
        path: variantPath(480, "webp")
      }
    ]);
  });

  it("rejects unsafe caller upload options and raw provider errors", async () => {
    const storage = createSupabaseImageStorage(config, {
      storage: {
        from() {
          return {
            async upload() {
              return { data: null, error: { message: "raw provider secret" } };
            },
            getPublicUrl(path: string) {
              return {
                data: {
                  publicUrl: `${config.publicBaseUrl}/storage/v1/object/public/${config.bucket}/${path}`
                }
              };
            }
          };
        }
      }
    });

    await expect(
      storage.uploadObject({
        body: Buffer.from("bad"),
        cacheControl: "31536000",
        contentType: "image/webp",
        path: variantPath(480, "webp"),
        upsert: true
      } as unknown as UploadImageObjectInput)
    ).rejects.toMatchObject({ code: "STORAGE_CONFIGURATION_INVALID" });
    await expect(
      storage.uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        path: variantPath(480, "webp"),
        upsert: false
      })
    ).rejects.toMatchObject({
      code: "STORAGE_WRITE_FAILED",
      message: expect.not.stringContaining("raw provider secret")
    });
  });

  it("inspects only canonical object folders and returns expected path membership", async () => {
    const listedPrefixes: string[] = [];
    const storage = createSupabaseImageStorage(config, {
      storage: {
        from() {
          return {
            async list(prefix: string) {
              listedPrefixes.push(prefix);
              return {
                data: [{ name: "480.webp" }, { name: "960.avif" }],
                error: null
              };
            }
          };
        }
      }
    });

    await expect(
      storage.inspectObjects([
        variantPath(480, "webp"),
        variantPath(960, "avif"),
        variantPath(1600, "webp")
      ])
    ).resolves.toEqual({
      existingPaths: [variantPath(480, "webp"), variantPath(960, "avif")],
      missingPaths: [variantPath(1600, "webp")]
    });
    expect(listedPrefixes).toEqual([`sites/${siteId}/preview/${assetId}`]);
    await expect(storage.inspectObjects(["sites/all"])).rejects.toMatchObject({
      code: "STORAGE_CONFIGURATION_INVALID"
    });
  });
});
