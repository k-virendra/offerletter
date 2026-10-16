import { describe, expect, it } from "vitest";
import { companyInputFromFormData, companySchema, firstFieldErrors, logoFileError, normalizeWebsite, type CompanyFormInput } from "./schema";

const valid: CompanyFormInput = {
  legal_name: "Example Engineering GmbH",
  trading_name: "",
  country_code: "DE",
  registration_number: "HRB 000000",
  registered_address: "Musterstraße 1, 80331 München",
  website: "example-engineering.test",
  contact_phone: "+49 89 1234 5678",
  contact_email: "People@Example-Engineering.test",
  brand_color: "1f4e8c",
  signatory_name: "Dr. Anna Weber",
  signatory_title: "Managing Director",
};

function errorsFor(changes: Partial<CompanyFormInput>) {
  const result = companySchema.safeParse({ ...valid, ...changes });
  return result.success ? {} : firstFieldErrors(result.error);
}

describe("companySchema", () => {
  it("normalises what people type", () => {
    const company = companySchema.parse(valid);
    expect(company.website).toBe("https://example-engineering.test");
    expect(company.contact_email).toBe("people@example-engineering.test");
    expect(company.brand_color).toBe("#1F4E8C");
    expect(company.trading_name).toBeNull();
  });

  it("stores empty optional fields as null", () => {
    const company = companySchema.parse({ ...valid, website: " ", brand_color: "" });
    expect(company.website).toBeNull();
    expect(company.brand_color).toBeNull();
  });

  it("explains each problem in plain words", () => {
    expect(errorsFor({ legal_name: "  " })).toEqual({ legal_name: "Enter the company’s legal name" });
    expect(errorsFor({ website: "sample-analytics" })).toEqual({ website: "Enter a full web address, like https://company.com" });
    expect(errorsFor({ contact_email: "people@sample-analytics" })).toEqual({ contact_email: "Add the ending, like .com" });
    expect(errorsFor({ contact_email: "people" })).toEqual({ contact_email: "Enter a full email address, like name@company.com" });
    expect(errorsFor({ contact_phone: "089 1234 5678" })).toEqual({
      contact_phone: "Enter a phone number with the country code, like +49 89 1234 5678",
    });
    expect(errorsFor({ brand_color: "blue" })).toEqual({ brand_color: "Enter a colour code, like #1F4E8C" });
    expect(errorsFor({ country_code: "XX" })).toEqual({ country_code: "Choose the country where the company is registered" });
  });

  it("matches the database's own checks", () => {
    // companies.website must match ^https?://[^\s]+\.[^\s]+$ and contact_email ^[^@\s]+@[^@\s]+\.[^@\s]+$
    const company = companySchema.parse(valid);
    expect(company.website).toMatch(/^https?:\/\/[^\s]+\.[^\s]+$/i);
    expect(company.contact_email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

describe("normalizeWebsite", () => {
  it("keeps http and https addresses and refuses other schemes", () => {
    expect(normalizeWebsite("http://example.com/careers")).toBe("http://example.com/careers");
    expect(normalizeWebsite("javascript://example.com")).toBeNull();
    expect(normalizeWebsite("ftp://example.com")).toBeNull();
    expect(normalizeWebsite("exa mple.com")).toBeNull();
  });
});

describe("logoFileError", () => {
  it("accepts PNG, JPG and WebP up to 2 MB", () => {
    expect(logoFileError({ type: "image/png", size: 48_000 })).toBeUndefined();
    expect(logoFileError({ type: "image/webp", size: 2 * 1024 * 1024 })).toBeUndefined();
  });

  it("refuses SVG and large files with the design's wording", () => {
    expect(logoFileError({ type: "image/svg+xml", size: 1000 })).toBe("Upload a PNG, JPG or WebP file. SVG isn’t accepted.");
    expect(logoFileError({ type: "image/png", size: 3.4 * 1024 * 1024 })).toBe("This file is 3.4 MB. Upload one under 2 MB.");
  });
});

describe("companyInputFromFormData", () => {
  it("reads text fields and ignores files posted under a field name", () => {
    const form = new FormData();
    form.set("legal_name", "Example GmbH");
    form.set("website", new File(["x"], "x.txt"));
    const input = companyInputFromFormData(form);
    expect(input.legal_name).toBe("Example GmbH");
    expect(input.website).toBe("");
    expect(input.signatory_name).toBe("");
  });
});
