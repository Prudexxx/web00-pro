import { describe, expect, it, vi } from "vitest";
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

function minimalPublicUrlClient() {
  return {
    storage: {
      from() {
        return {
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
  };
}

function observableBodyResponse(
  status: number,
  bodyText = "provider raw body service-role-secret storage/v1/object/sites/bad"
): { cancelled: () => boolean; response: Response } {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bodyText));
      controller.close();
    }
  });

  return {
    cancelled: () => cancelled,
    response: new Response(stream, {
      headers: { "content-type": "application/json" },
      status
    })
  };
}

function expectBodyDisposed(response: Response, cancelled: () => boolean): void {
  expect(response.bodyUsed || cancelled()).toBe(true);
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

  it("uses a finite abortable Storage upload request when an operation context is supplied", async () => {
    const controller = new AbortController();
    const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
    const storage = createSupabaseImageStorage(config, {
      storage: {
        from() {
          return {
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
    }, {
      fetchImpl: async (url, init) => {
        calls.push({ init, url: String(url) });
        return new Response(JSON.stringify({ path: variantPath(480, "webp") }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
    });

    await expect(
      storage.uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        context: {
          requestId: "req_storage_deadline",
          signal: controller.signal,
          timeoutMs: 1_500
        },
        path: variantPath(480, "webp"),
        upsert: false
      })
    ).resolves.toMatchObject({
      path: variantPath(480, "webp")
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://project.supabase.co/storage/v1/object/${config.bucket}/${variantPath(480, "webp")}`
    );
    expect(calls[0]?.init).toMatchObject({
      body: Buffer.from("webp"),
      method: "POST",
      signal: expect.any(AbortSignal)
    });
    expect(calls[0]?.init?.headers).toMatchObject({
      "cache-control": "max-age=31536000",
      "content-type": "image/webp",
      "x-upsert": "false"
    });
  });

  it("uses the exact Supabase object list REST contract with prefix only in the JSON body", async () => {
    const calls: Array<{ body: unknown; init: RequestInit | undefined; url: string }> = [];
    const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
      fetchImpl: async (url, init) => {
        calls.push({
          body:
            typeof init?.body === "string"
              ? JSON.parse(init.body) as unknown
              : init?.body,
          init,
          url: String(url)
        });

        return new Response(JSON.stringify([{ name: "480.webp" }]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
    });
    const existingPath = variantPath(480, "webp");
    const missingPath = variantPath(960, "avif");

    await expect(
      storage.inspectObjects([existingPath, missingPath], {
        requestId: "req_storage_list_contract",
        timeoutMs: 1_000
      })
    ).resolves.toEqual({
      existingPaths: [existingPath],
      missingPaths: [missingPath]
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://project.supabase.co/storage/v1/object/list/web00-catalog-images"
    );
    expect(calls[0]?.url).not.toContain(`/list/${config.bucket}/sites/`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.body).toEqual({
      limit: 100,
      offset: 0,
      prefix: `sites/${siteId}/preview/${assetId}`,
      sortBy: {
        column: "name",
        order: "asc"
      }
    });
  });

  it("disposes the response body after successful abortable upload", async () => {
    const uploadResponse = observableBodyResponse(200, "{}");
    const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
      fetchImpl: async () => uploadResponse.response
    });

    await expect(
      storage.uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        context: {
          requestId: "req_storage_upload_disposal",
          timeoutMs: 1_000
        },
        path: variantPath(480, "webp"),
        upsert: false
      })
    ).resolves.toMatchObject({
      path: variantPath(480, "webp")
    });

    expectBodyDisposed(uploadResponse.response, uploadResponse.cancelled);
  });

  it("disposes the response body after successful abortable remove", async () => {
    const removeResponse = observableBodyResponse(200, "{}");
    const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
      fetchImpl: async () => removeResponse.response
    });

    await expect(
      storage.removeObjects([variantPath(480, "webp")], {
        requestId: "req_storage_remove_disposal",
        timeoutMs: 1_000
      })
    ).resolves.toEqual({
      removedPaths: [variantPath(480, "webp")]
    });

    expectBodyDisposed(removeResponse.response, removeResponse.cancelled);
  });

  it.each([
    [
      "upload",
      "STORAGE_WRITE_FAILED",
      (storage: ReturnType<typeof createSupabaseImageStorage>) =>
        storage.uploadObject({
          body: Buffer.from("webp"),
          cacheControl: "31536000",
          contentType: "image/webp",
          context: {
            requestId: "req_storage_non_2xx_disposal",
            timeoutMs: 1_000
          },
          path: variantPath(480, "webp"),
          upsert: false
        })
    ],
    [
      "remove",
      "STORAGE_UNAVAILABLE",
      (storage: ReturnType<typeof createSupabaseImageStorage>) =>
        storage.removeObjects([variantPath(480, "webp")], {
          requestId: "req_storage_non_2xx_disposal",
          timeoutMs: 1_000
        })
    ]
  ] as const)(
    "disposes the response body after non-2xx abortable %s without exposing provider content",
    async (_label, expectedCode, run) => {
      const providerResponse = observableBodyResponse(
        503,
        "provider raw body service-role-secret storage/v1/object/sites/bad"
      );
      const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
        fetchImpl: async () => providerResponse.response
      });

      const error = await run(storage).catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        code: expectedCode
      });
      expect(JSON.stringify(error)).not.toMatch(
        /service-role-secret|storage\/v1\/object|provider raw body/i
      );
      expectBodyDisposed(providerResponse.response, providerResponse.cancelled);
    }
  );

  it.each([
    [
      "inspect",
      (storage: ReturnType<typeof createSupabaseImageStorage>) =>
        storage.inspectObjects([variantPath(480, "webp")], {
          requestId: "req_storage_deadline",
          timeoutMs: 5
        })
    ],
    [
      "remove",
      (storage: ReturnType<typeof createSupabaseImageStorage>) =>
        storage.removeObjects([variantPath(480, "webp")], {
          requestId: "req_storage_deadline",
          timeoutMs: 5
        })
    ],
    [
      "upload",
      (storage: ReturnType<typeof createSupabaseImageStorage>) =>
        storage.uploadObject({
          body: Buffer.from("webp"),
          cacheControl: "31536000",
          contentType: "image/webp",
          context: {
            requestId: "req_storage_deadline",
            timeoutMs: 5
          },
          path: variantPath(480, "webp"),
          upsert: false
        })
    ]
  ] as const)("aborts %s fetch on its own finite storage deadline", async (_name, run) => {
    vi.useFakeTimers();

    try {
      let aborted = false;
      const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
        fetchImpl: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true }
            );
          })
      });
      const result = run(storage).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(5);

      await expect(result).resolves.toMatchObject({
        code: "IMAGE_STORAGE_TIMEOUT",
        statusCode: 503
      });
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps caller abort separately from storage's own timeout and removes abort listeners", async () => {
    const caller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
      fetchImpl: async (_url, init) => {
        fetchSignal = init?.signal ?? undefined;

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      }
    });
    const result = storage
      .uploadObject({
        body: Buffer.from("webp"),
        cacheControl: "31536000",
        contentType: "image/webp",
        context: {
          requestId: "req_storage_abort",
          signal: caller.signal,
          timeoutMs: 60_000
        },
        path: variantPath(480, "webp"),
        upsert: false
      })
      .catch((error: unknown) => error);

    await Promise.resolve();
    caller.abort();

    await expect(result).resolves.toMatchObject({
      code: "CLIENT_ABORTED",
      statusCode: 499
    });
    expect(fetchSignal?.aborted).toBe(true);

    caller.abort();
    await Promise.resolve();

    expect(fetchSignal?.aborted).toBe(true);
  });

  it.each([
    ["caller abort", undefined, "CLIENT_ABORTED"],
    [
      "parent request cancellation",
      Object.assign(new Error("request cancelled"), { code: "REQUEST_CANCELLED" }),
      "REQUEST_CANCELLED"
    ]
  ] as const)(
    "keeps %s sticky when the storage timeout fires before fetch settles",
    async (_label, abortReason, expectedCode) => {
      vi.useFakeTimers();

      try {
        const caller = new AbortController();
        let rejectFetch: ((error: unknown) => void) | undefined;
        const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
          fetchImpl: async () =>
            new Promise<Response>((_resolve, reject) => {
              rejectFetch = reject;
            })
        });
        const result = storage
          .inspectObjects([variantPath(480, "webp")], {
            requestId: "req_storage_abort_sticky",
            signal: caller.signal,
            timeoutMs: 10
          })
          .catch((error: unknown) => error);

        await Promise.resolve();

        if (abortReason === undefined) {
          caller.abort();
        } else {
          caller.abort(abortReason);
        }

        await vi.advanceTimersByTimeAsync(10);
        rejectFetch?.(new DOMException("Aborted", "AbortError"));

        await expect(result).resolves.toMatchObject({
          code: expectedCode,
          statusCode: 499
        });
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it.each([
    ["own timeout", null, "IMAGE_STORAGE_TIMEOUT", 503],
    ["client abort", undefined, "CLIENT_ABORTED", 499],
    [
      "request cancellation",
      Object.assign(new Error("request cancelled"), { code: "REQUEST_CANCELLED" }),
      "REQUEST_CANCELLED",
      499
    ]
  ] as const)(
    "preserves %s taxonomy and sticky first abort reason",
    async (_label, abortReason, expectedCode, expectedStatusCode) => {
      vi.useFakeTimers();

      try {
        const caller = abortReason === null ? undefined : new AbortController();
        const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
          fetchImpl: async (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            })
        });
        const result = storage
          .inspectObjects([variantPath(480, "webp")], {
            requestId: "req_storage_abort_taxonomy",
            signal: caller?.signal,
            timeoutMs: 10
          })
          .catch((error: unknown) => error);

        await Promise.resolve();

        if (abortReason !== null) {
          caller?.abort(abortReason);
        }

        await vi.advanceTimersByTimeAsync(10);

        await expect(result).resolves.toMatchObject({
          code: expectedCode,
          statusCode: expectedStatusCode
        });
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("does not expose storage credentials, provider bodies, object URLs, or raw errors", async () => {
    const storage = createSupabaseImageStorage(config, minimalPublicUrlClient(), {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: "provider raw body service-role-secret storage/v1/object/sites/bad"
          }),
          {
            headers: { "content-type": "application/json" },
            status: 503
          }
        )
    });

    const error = await storage
      .removeObjects([variantPath(480, "webp")], {
        requestId: "req_storage_safe_error",
        timeoutMs: 1_000
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      message: "Storage is unavailable."
    });
    expect(JSON.stringify(error)).not.toMatch(
      /service-role-secret|storage\/v1\/object|provider raw body/i
    );
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
