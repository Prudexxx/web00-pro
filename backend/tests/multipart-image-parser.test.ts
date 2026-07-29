import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createBusboyMultipartImageParser } from "../src/modules/images/multipart-image-parser.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

interface MultipartPart {
  contentType?: string;
  field: string;
  filename?: string;
  value: Buffer | string;
}

function multipartRequest(parts: MultipartPart[], boundary = "b7-test-boundary") {
  const bodyParts: Buffer[] = [];

  for (const part of parts) {
    const headers = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${part.field}"${
        part.filename === undefined ? "" : `; filename="${part.filename}"`
      }`
    ];

    if (part.contentType !== undefined) {
      headers.push(`Content-Type: ${part.contentType}`);
    }

    bodyParts.push(Buffer.from(`${headers.join("\r\n")}\r\n\r\n`));
    bodyParts.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    bodyParts.push(Buffer.from("\r\n"));
  }

  bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

  return Object.assign(Readable.from(bodyParts), {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    }
  });
}

function multipartField(boundary: string, field: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"\r\n\r\n` +
      `${value}\r\n`
  );
}

function multipartFile(
  boundary: string,
  field: string,
  filename: string,
  contentType: string,
  value: Buffer
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    value,
    Buffer.from("\r\n")
  ]);
}

describe("createBusboyMultipartImageParser", () => {
  it("parses one image file with clientFileId and trimmed alt", async () => {
    const parser = createBusboyMultipartImageParser();

    await expect(
      parser.parseSingle(
        multipartRequest([
          { field: "clientFileId", value: firstId },
          { field: "alt", value: "  Preview alt  " },
          {
            contentType: "image/png",
            field: "image",
            filename: "ignored-original-name.png",
            value: Buffer.from("png-bytes")
          }
        ])
      )
    ).resolves.toEqual({
      alt: "Preview alt",
      assetId: firstId,
      declaredMimeType: "image/png",
      index: 0,
      source: Buffer.from("png-bytes")
    });
  });

  it("parses batch images by stream index and metadata index", async () => {
    const parser = createBusboyMultipartImageParser();

    await expect(
      parser.parseBatch(
        multipartRequest([
          {
            field: "metadata",
            value: JSON.stringify([
              { alt: "First", clientFileId: firstId },
              { alt: "Second", clientFileId: secondId }
            ])
          },
          {
            contentType: "image/jpeg",
            field: "images",
            filename: "one.jpg",
            value: Buffer.from("one")
          },
          {
            contentType: "image/webp",
            field: "images",
            filename: "two.webp",
            value: Buffer.from("two")
          }
        ])
      )
    ).resolves.toEqual([
      {
        alt: "First",
        assetId: firstId,
        declaredMimeType: "image/jpeg",
        index: 0,
        source: Buffer.from("one")
      },
      {
        alt: "Second",
        assetId: secondId,
        declaredMimeType: "image/webp",
        index: 1,
        source: Buffer.from("two")
      }
    ]);
  });

  it("streams a completed batch file before the whole request finishes", async () => {
    const parser = createBusboyMultipartImageParser();
    const boundary = "b7-stream-boundary";
    const request = Object.assign(new PassThrough(), {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`
      }
    });
    const iterator = parser.parseBatchStream(request)[Symbol.asyncIterator]();

    request.write(
      Buffer.concat([
        multipartField(
          boundary,
          "metadata",
          JSON.stringify([
            { alt: "First", clientFileId: firstId },
            { alt: "Second", clientFileId: secondId }
          ])
        ),
        multipartFile(boundary, "images", "one.png", "image/png", Buffer.from("one")),
        Buffer.from(
          `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="images"; filename="two.png"\r\n' +
            "Content-Type: image/png\r\n\r\n"
        )
      ])
    );

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        alt: "First",
        assetId: firstId,
        declaredMimeType: "image/png",
        index: 0,
        source: Buffer.from("one")
      }
    });

    request.end(Buffer.concat([Buffer.from("two\r\n"), Buffer.from(`--${boundary}--\r\n`)]));

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        alt: "Second",
        assetId: secondId,
        index: 1,
        source: Buffer.from("two")
      }
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("rejects aborted batch requests with a safe error", async () => {
    const parser = createBusboyMultipartImageParser();
    const boundary = "b7-abort-boundary";
    const request = Object.assign(new PassThrough(), {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`
      }
    });
    const parsed = parser.parseBatch(request);

    request.write(
      Buffer.concat([
        multipartField(boundary, "metadata", JSON.stringify([{ clientFileId: firstId }])),
        Buffer.from(
          `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="images"; filename="one.png"\r\n' +
            "Content-Type: image/png\r\n\r\npartial"
        )
      ])
    );
    request.emit("aborted");
    request.destroy();

    await expect(parsed).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid multipart request."
    });
  });

  it("rejects batch files that arrive before metadata", async () => {
    const parser = createBusboyMultipartImageParser();
    const boundary = "b7-order-boundary";

    await expect(
      parser.parseBatch(
        multipartRequest(
          [
            {
              contentType: "image/png",
              field: "images",
              filename: "one.png",
              value: Buffer.from("one")
            },
            {
              field: "metadata",
              value: JSON.stringify([{ clientFileId: firstId }])
            }
          ],
          boundary
        )
      )
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("rejects missing files, unknown fields, duplicate ids, metadata mismatch, and too many files", async () => {
    const parser = createBusboyMultipartImageParser();

    await expect(
      parser.parseSingle(multipartRequest([{ field: "clientFileId", value: firstId }]))
    ).rejects.toMatchObject({ code: "IMAGE_REQUIRED" });
    await expect(
      parser.parseSingle(
        multipartRequest([
          { field: "clientFileId", value: firstId },
          { field: "unexpected", value: "nope" },
          {
            contentType: "image/png",
            field: "image",
            filename: "one.png",
            value: Buffer.from("one")
          }
        ])
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      parser.parseBatch(
        multipartRequest([
          {
            field: "metadata",
            value: JSON.stringify([
              { clientFileId: firstId },
              { clientFileId: firstId }
            ])
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "one.png",
            value: Buffer.from("one")
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "two.png",
            value: Buffer.from("two")
          }
        ])
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      parser.parseBatch(
        multipartRequest([
          {
            field: "metadata",
            value: JSON.stringify([{ clientFileId: firstId }])
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "one.png",
            value: Buffer.from("one")
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "two.png",
            value: Buffer.from("two")
          }
        ])
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const tooMany = Array.from({ length: 11 }, (_value, index) => ({
      contentType: "image/png",
      field: "images",
      filename: `${index}.png`,
      value: Buffer.from(String(index))
    }));

    await expect(
      parser.parseBatch(
        multipartRequest([
          {
            field: "metadata",
            value: JSON.stringify(
              tooMany.map((_part, index) => ({
                clientFileId: `${index.toString().padStart(8, "0")}-1111-4111-8111-111111111111`
              }))
            )
          },
          ...tooMany
        ])
      )
    ).rejects.toMatchObject({ code: "IMAGE_BATCH_LIMIT_EXCEEDED" });
  });

  it("enforces per-file and total raw byte limits", async () => {
    const parser = createBusboyMultipartImageParser({
      fileSize: 5
    });

    await expect(
      parser.parseSingle(
        multipartRequest([
          { field: "clientFileId", value: firstId },
          {
            contentType: "image/png",
            field: "image",
            filename: "large.png",
            value: Buffer.alloc(6)
          }
        ])
      )
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    const totalParser = createBusboyMultipartImageParser({
      batchTotalBytes: 8,
      fileSize: 6
    });

    await expect(
      totalParser.parseBatch(
        multipartRequest([
          {
            field: "metadata",
            value: JSON.stringify([
              { clientFileId: firstId },
              { clientFileId: secondId }
            ])
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "one.png",
            value: Buffer.alloc(5)
          },
          {
            contentType: "image/png",
            field: "images",
            filename: "two.png",
            value: Buffer.alloc(5)
          }
        ])
      )
    ).rejects.toMatchObject({ code: "IMAGE_TOTAL_SIZE_EXCEEDED" });
  });
});
