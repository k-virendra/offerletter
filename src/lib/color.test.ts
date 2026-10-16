import { describe, expect, it } from "vitest";
import { contrastOnWhite, normalizeHex, readableAccent } from "./color";

describe("normalizeHex", () => {
  it("accepts codes with or without # and in any case", () => {
    expect(normalizeHex("#1f4e8c")).toBe("#1F4E8C");
    expect(normalizeHex("1F4E8C")).toBe("#1F4E8C");
    expect(normalizeHex(" #abc ")).toBe("#AABBCC");
  });

  it("rejects anything that isn't a colour code", () => {
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("readableAccent", () => {
  it("keeps a colour that is already readable on white", () => {
    expect(readableAccent("#1F4E8C")).toEqual({ hex: "#1F4E8C", darkened: false });
    expect(readableAccent("#0F6E5F")).toEqual({ hex: "#0F6E5F", darkened: false });
  });

  it("darkens a light colour the way the design does", () => {
    // The Sample Analytics example on the design canvas.
    expect(readableAccent("#F2A541")).toEqual({ hex: "#8E6227", darkened: true });
  });

  it("always ends at AA contrast, even for white", () => {
    for (const hex of ["#FFFFFF", "#FFFF00", "#F0B43C", "#7FDBFF", "#CCCCCC"]) {
      const { hex: accent } = readableAccent(hex);
      expect(contrastOnWhite(accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
