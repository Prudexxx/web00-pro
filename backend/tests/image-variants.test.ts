import { describe, expect, it } from "vitest";
import {
  IMAGE_ENCODER_OPTIONS,
  selectVariantWidths
} from "../src/modules/images/image-variants.js";

describe("image variants", () => {
  it.each([
    [320, [320]],
    [480, [480]],
    [640, [480, 640]],
    [960, [480, 960]],
    [1200, [480, 960, 1200]],
    [1600, [480, 960, 1600]],
    [2400, [480, 960, 1600]]
  ])("selects widths without enlargement for %i", (originalWidth, widths) => {
    expect(selectVariantWidths(originalWidth)).toEqual(widths);
    expect(selectVariantWidths(originalWidth).every((width) => width <= originalWidth)).toBe(
      true
    );
  });

  it("rejects invalid source widths", () => {
    expect(() => selectVariantWidths(0)).toThrow("originalWidth");
    expect(() => selectVariantWidths(1.5)).toThrow("originalWidth");
  });

  it("keeps the approved encoder options stable", () => {
    expect(IMAGE_ENCODER_OPTIONS).toEqual({
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
    });
  });
});
