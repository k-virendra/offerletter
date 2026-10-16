import { describe, expect, it } from "vitest";
import { companyInitials, letterSummary, letterSummaryShort, placesLeft } from "./format";

describe("company card wording", () => {
  it("summarises letters the way the design does", () => {
    expect(letterSummary(12, 2)).toBe("12 paid · 2 drafts");
    expect(letterSummary(5, 0)).toBe("5 paid");
    expect(letterSummary(0, 2)).toBe("2 drafts · none paid");
    expect(letterSummary(1, 1)).toBe("1 paid · 1 draft");
    expect(letterSummary(0, 0)).toBe("No letters yet");
    expect(letterSummaryShort(12, 2)).toBe("12 paid letters");
    expect(letterSummaryShort(0, 1)).toBe("1 draft");
  });

  it("counts places left", () => {
    expect(placesLeft(4, 5)).toBe("1 place left");
    expect(placesLeft(0, 5)).toBe("5 places left");
    expect(placesLeft(7, 5)).toBe("0 places left");
  });

  it("makes initials from the first two words", () => {
    expect(companyInitials("Example Engineering GmbH")).toBe("EE");
    expect(companyInitials("Sample Analytics Inc.")).toBe("SA");
    expect(companyInitials("élan studio")).toBe("ÉS");
    expect(companyInitials("3M")).toBe("3");
  });
});
