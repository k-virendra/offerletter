import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/letters/abc/edit?step=2")).toBe("/letters/abc/edit?step=2");
  });

  it("refuses other sites and odd input", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined, 42, "dashboard", "/a\nb"]) {
      expect(safeNext(value)).toBe("/dashboard");
    }
  });

  it("never loops back to sign-in or auth routes", () => {
    expect(safeNext("/sign-in")).toBe("/dashboard");
    expect(safeNext("/auth/confirm?token_hash=x")).toBe("/dashboard");
  });
});
