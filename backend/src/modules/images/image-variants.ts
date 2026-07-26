export const IMAGE_ENCODER_OPTIONS = {
  avif: {
    chromaSubsampling: "4:4:4",
    effort: 4,
    quality: 55
  },
  webp: {
    effort: 4,
    quality: 82,
    smartSubsample: true
  }
} as const;

export function selectVariantWidths(originalWidth: number): number[] {
  if (!Number.isInteger(originalWidth) || originalWidth <= 0) {
    throw new Error("originalWidth must be a positive integer.");
  }

  const widths = [480, 960, 1600].filter((width) => width <= originalWidth);

  if (originalWidth < 1600) {
    widths.push(originalWidth);
  }

  return [...new Set(widths)].sort((left, right) => left - right);
}
