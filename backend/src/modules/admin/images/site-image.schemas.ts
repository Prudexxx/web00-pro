import { z } from "zod";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";

const uuidSchema = z.string().uuid();

export function parseSiteImageParams(input: unknown): { id: string } {
  return parseWithSchema(z.object({ id: uuidSchema }).strict(), input) as {
    id: string;
  };
}

export function parseGalleryDeleteParams(input: unknown): {
  assetId: string;
  id: string;
} {
  return parseWithSchema(
    z.object({ assetId: uuidSchema, id: uuidSchema }).strict(),
    input
  ) as { assetId: string; id: string };
}

export function parseGalleryReorderInput(input: unknown): {
  items: Array<{ alt?: string; assetId: string; sortOrder: number }>;
} {
  return parseWithSchema(
    z
      .object({
        items: z
          .array(
            z
              .object({
                alt: z.string().trim().max(160).optional(),
                assetId: uuidSchema,
                sortOrder: z.number().int().min(0)
              })
              .strict()
          )
          .max(20)
      })
      .strict(),
    input
  ) as { items: Array<{ alt?: string; assetId: string; sortOrder: number }> };
}

function parseWithSchema(schema: z.ZodType, input: unknown): unknown {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw validationError(
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join(".")
      }))
    );
  }

  return parsed.data;
}

function validationError(details: readonly ErrorDetail[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
