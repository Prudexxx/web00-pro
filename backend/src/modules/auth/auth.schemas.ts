import { z } from "zod";

export interface LoginBody {
  email: string;
  password: string;
}

const loginBodySchema = z
  .object({
    email: z.string().trim().min(1).email().transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(1024)
  })
  .strict();

export function parseLoginBody(input: unknown): LoginBody {
  return loginBodySchema.parse(input);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
