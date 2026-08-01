export interface ImageProcessingEnv {
  IMAGE_PROCESSING_CONCURRENCY: number;
  IMAGE_PROCESSING_MAX_PIXELS: number;
  IMAGE_PROCESSING_MAX_QUEUE: number;
  IMAGE_PROCESSING_QUEUE_WAIT_MS: number;
  IMAGE_PROCESSING_TIMEOUT_MS: number;
}

export interface ImageProcessingConfig {
  maxConcurrency: number;
  maxPixels: number;
  maxQueued: number;
  queueWaitTimeoutMs: number;
  timeoutMs: number;
}

export interface ImageProcessingEnvValidationIssue {
  message: string;
  variable: keyof ImageProcessingEnv;
}

export class ImageProcessingEnvValidationError extends Error {
  public readonly issues: readonly ImageProcessingEnvValidationIssue[];

  public constructor(issues: readonly ImageProcessingEnvValidationIssue[]) {
    const variables = issues.map((issue) => issue.variable).join(", ");

    super(`Invalid image processing environment configuration: ${variables}`);
    this.name = "ImageProcessingEnvValidationError";
    this.issues = issues;
  }
}

export const IMAGE_PROCESSING_TIMEOUT_LIMITS = {
  default: 90_000,
  max: 110_000,
  min: 60_000
} as const;

export const IMAGE_PROCESSING_CONCURRENCY_LIMITS = {
  default: 1,
  max: 1,
  min: 1
} as const;

export const IMAGE_PROCESSING_MAX_PIXELS_LIMITS = {
  default: 16_000_000,
  max: 40_000_000,
  min: 1_000_000
} as const;

export const IMAGE_PROCESSING_MAX_QUEUE_LIMITS = {
  default: 2,
  max: 4,
  min: 0
} as const;

export const IMAGE_PROCESSING_QUEUE_WAIT_LIMITS = {
  default: 5_000,
  max: 60_000,
  min: 1
} as const;

export const defaultImageProcessingConfig: ImageProcessingConfig = {
  maxConcurrency: IMAGE_PROCESSING_CONCURRENCY_LIMITS.default,
  maxPixels: IMAGE_PROCESSING_MAX_PIXELS_LIMITS.default,
  maxQueued: IMAGE_PROCESSING_MAX_QUEUE_LIMITS.default,
  queueWaitTimeoutMs: IMAGE_PROCESSING_QUEUE_WAIT_LIMITS.default,
  timeoutMs: IMAGE_PROCESSING_TIMEOUT_LIMITS.default
};

export function parseImageProcessingEnv(input: NodeJS.ProcessEnv): ImageProcessingEnv {
  const issues: ImageProcessingEnvValidationIssue[] = [];
  const timeoutMs = parseBoundedInteger(input.IMAGE_PROCESSING_TIMEOUT_MS, {
    issues,
    limits: IMAGE_PROCESSING_TIMEOUT_LIMITS,
    message:
      "IMAGE_PROCESSING_TIMEOUT_MS must be an integer between 60000 and 170000 milliseconds.",
    variable: "IMAGE_PROCESSING_TIMEOUT_MS"
  });
  const concurrency = parseBoundedInteger(input.IMAGE_PROCESSING_CONCURRENCY, {
    issues,
    limits: IMAGE_PROCESSING_CONCURRENCY_LIMITS,
    message: "IMAGE_PROCESSING_CONCURRENCY must be exactly 1 on the weak CPU production profile.",
    variable: "IMAGE_PROCESSING_CONCURRENCY"
  });
  const maxPixels = parseBoundedInteger(input.IMAGE_PROCESSING_MAX_PIXELS, {
    issues,
    limits: IMAGE_PROCESSING_MAX_PIXELS_LIMITS,
    message:
      "IMAGE_PROCESSING_MAX_PIXELS must be an integer between 1000000 and 40000000 pixels.",
    variable: "IMAGE_PROCESSING_MAX_PIXELS"
  });
  const maxQueued = parseBoundedInteger(input.IMAGE_PROCESSING_MAX_QUEUE, {
    issues,
    limits: IMAGE_PROCESSING_MAX_QUEUE_LIMITS,
    message: "IMAGE_PROCESSING_MAX_QUEUE must be an integer between 0 and 4.",
    variable: "IMAGE_PROCESSING_MAX_QUEUE"
  });
  const queueWaitTimeoutMs = parseBoundedInteger(input.IMAGE_PROCESSING_QUEUE_WAIT_MS, {
    issues,
    limits: IMAGE_PROCESSING_QUEUE_WAIT_LIMITS,
    message:
      "IMAGE_PROCESSING_QUEUE_WAIT_MS must be an integer between 1 and 60000 milliseconds.",
    variable: "IMAGE_PROCESSING_QUEUE_WAIT_MS"
  });

  if (issues.length > 0) {
    throw new ImageProcessingEnvValidationError(issues);
  }

  return {
    IMAGE_PROCESSING_CONCURRENCY: concurrency,
    IMAGE_PROCESSING_MAX_PIXELS: maxPixels,
    IMAGE_PROCESSING_MAX_QUEUE: maxQueued,
    IMAGE_PROCESSING_QUEUE_WAIT_MS: queueWaitTimeoutMs,
    IMAGE_PROCESSING_TIMEOUT_MS: timeoutMs
  };
}

export function toImageProcessingConfig(env: ImageProcessingEnv): ImageProcessingConfig {
  return {
    maxConcurrency: env.IMAGE_PROCESSING_CONCURRENCY,
    maxPixels: env.IMAGE_PROCESSING_MAX_PIXELS,
    maxQueued: env.IMAGE_PROCESSING_MAX_QUEUE,
    queueWaitTimeoutMs: env.IMAGE_PROCESSING_QUEUE_WAIT_MS,
    timeoutMs: env.IMAGE_PROCESSING_TIMEOUT_MS
  };
}

function parseBoundedInteger(
  value: string | undefined,
  options: {
    issues: ImageProcessingEnvValidationIssue[];
    limits: { default: number; max: number; min: number };
    message: string;
    variable: keyof ImageProcessingEnv;
  }
): number {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return options.limits.default;
  }

  if (!/^\d+$/.test(trimmed)) {
    options.issues.push({
      message: options.message,
      variable: options.variable
    });
    return options.limits.default;
  }

  const parsed = Number(trimmed);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.limits.min ||
    parsed > options.limits.max
  ) {
    options.issues.push({
      message: options.message,
      variable: options.variable
    });
    return options.limits.default;
  }

  return parsed;
}
