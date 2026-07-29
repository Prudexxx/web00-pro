import { z } from "zod";

export const healthResponseSchema = z.object({
  data: z.object({
    service: z.string().min(1),
    status: z.literal("ok"),
    time: z.string().datetime()
  })
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
