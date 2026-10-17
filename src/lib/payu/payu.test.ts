import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { amountMinor, amountString, buildPayuFields, loggableResponse, newTxnid, payuSafe } from "./fields";
import { hashesMatch, payuCommandHash, payuRequestHash, payuResponseHash, verifyPayuResponse } from "./hash";
import { mapPaymentStatus, parseVerifyResponse } from "./verify";

// Hash tests from Askora (the formulas Elite Lease Living runs live). TODO before go-live: add PayU's published
// sample vectors.

const SALT = "test_salt_value_123";
const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

describe("payuRequestHash", () => {
  it("joins the fields with six empty slots before the salt", () => {
    const hash = payuRequestHash(
      { key: "K", txnid: "OLP-20261017-7Q4K2M", amount: "799.00", productinfo: "Offer letter", firstname: "Anna", email: "a@b.de", udf1: "letter", udf2: "user" },
      SALT,
    );
    expect(hash).toBe(sha512(`K|OLP-20261017-7Q4K2M|799.00|Offer letter|Anna|a@b.de|letter|user|||||||||${SALT}`));
  });
});

describe("payuResponseHash", () => {
  const response = {
    key: "K",
    txnid: "OLP-20261017-7Q4K2M",
    amount: "799.00",
    productinfo: "Offer letter",
    firstname: "Anna",
    email: "a@b.de",
    udf1: "letter",
    udf2: "user",
    status: "success",
  };

  it("verifies an untampered response and rejects a changed amount or status", () => {
    const hash = payuResponseHash(response, SALT);
    expect(hashesMatch(hash, payuResponseHash(response, SALT))).toBe(true);
    expect(hashesMatch(hash, payuResponseHash({ ...response, amount: "1.00" }, SALT))).toBe(false);
    expect(hashesMatch(hash, payuResponseHash({ ...response, status: "failure" }, SALT))).toBe(false);
  });

  it("matches PayU's documented reverse formula", () => {
    expect(payuResponseHash(response, SALT)).toBe(sha512(`${SALT}|success|||||||||user|letter|a@b.de|Anna|Offer letter|799.00|OLP-20261017-7Q4K2M|K`));
  });

  it("prefixes additional_charges when PayU adds them", () => {
    expect(payuResponseHash({ ...response, additional_charges: "10.00" }, SALT)).toBe(
      sha512(`10.00|${SALT}|success|||||||||user|letter|a@b.de|Anna|Offer letter|799.00|OLP-20261017-7Q4K2M|K`),
    );
  });

  it("treats a missing hash as a mismatch", () => {
    expect(hashesMatch(payuResponseHash(response, SALT), undefined)).toBe(false);
  });
});

describe("verifyPayuResponse", () => {
  const signed = (fields: Record<string, string>, amount: string) => ({ ...fields, hash: payuResponseHash(fields, SALT, amount) });
  const base = { key: "K", txnid: "OLP-20261017-7Q4K2M", productinfo: "Offer letter", firstname: "Anna", email: "a@b.de", udf1: "letter", udf2: "user", status: "success" };

  it("accepts the amount in any format PayU echoes it in", () => {
    for (const [echoed, signedWith] of [["799.00", "799.00"], ["799", "799.00"], ["799.0", "799"], ["799.00", "799"]] as const) {
      expect(verifyPayuResponse(signed({ ...base, amount: echoed }, signedWith), SALT)).toBe(true);
    }
  });

  it("checks additional_charges, and rejects tampering or a wrong salt", () => {
    const withCharges = { ...base, amount: "799.00", additional_charges: "9.80" };
    expect(verifyPayuResponse({ ...withCharges, hash: payuResponseHash(withCharges, SALT) }, SALT)).toBe(true);
    const good = signed({ ...base, amount: "799.00" }, "799.00");
    expect(verifyPayuResponse({ ...good, amount: "1.00" }, SALT)).toBe(false);
    expect(verifyPayuResponse({ ...good, status: "failure" }, SALT)).toBe(false);
    expect(verifyPayuResponse({ ...good, udf1: "another-letter" }, SALT)).toBe(false);
    expect(verifyPayuResponse(good, "another_salt_value")).toBe(false);
    expect(verifyPayuResponse({ ...good, hash: "" }, SALT)).toBe(false);
  });
});

describe("payuCommandHash", () => {
  it("uses key|command|var1|salt", () => {
    expect(payuCommandHash("K", "verify_payment", "T1", SALT)).toBe(sha512(`K|verify_payment|T1|${SALT}`));
  });
});

describe("amounts", () => {
  it("formats minor units the way PayU takes them", () => {
    expect(amountString(79900)).toBe("799.00");
    expect(amountString(900)).toBe("9.00");
    expect(amountString(1)).toBe("0.01");
    expect(() => amountString(0)).toThrow();
    expect(() => amountString(12.5)).toThrow();
  });

  it("reads the amounts PayU echoes back", () => {
    expect(amountMinor("799")).toBe(79900);
    expect(amountMinor("799.0")).toBe(79900);
    expect(amountMinor(" 799.00 ")).toBe(79900);
    expect(amountMinor("0.29")).toBe(29);
    for (const bad of ["", "799.001", "-1", "7e2", "799,00", null, undefined]) expect(amountMinor(bad)).toBeNull();
  });
});

describe("checkout fields", () => {
  it("keeps pipes and control characters out of hashed text", () => {
    expect(payuSafe("Offer | letter\n\tfor  Lena", 100)).toBe("Offer letter for Lena");
    expect(payuSafe("x".repeat(80), 60)).toHaveLength(60);
  });

  it("makes readable transaction ids PayU accepts", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newTxnid(new Date("2026-10-17T10:00:00Z"))));
    expect(ids.size).toBeGreaterThan(195);
    for (const id of ids) expect(id).toMatch(/^OLP-20261017-[2-9A-HJKMNP-Z]{6}$/);
    expect([...ids][0]!.length).toBeLessThanOrEqual(25);
  });

  it("signs exactly what's posted, with both return URLs and the letter and user", () => {
    const fields = buildPayuFields({
      key: "K",
      salt: SALT,
      txnid: "OLP-20261017-7Q4K2M",
      amountMinor: 79900,
      productinfo: "Offer letter",
      firstname: "Anna | Weber",
      email: " anna@example.de ",
      phone: "+49 (89) 1234-5678",
      returnUrl: "https://offerletter.example/api/payu/return",
      letterId: "letter-1",
      userId: "user-1",
    });
    expect(fields).toMatchObject({
      amount: "799.00",
      firstname: "Anna Weber",
      email: "anna@example.de",
      phone: "+498912345678",
      udf1: "letter-1",
      udf2: "user-1",
      surl: "https://offerletter.example/api/payu/return",
      furl: "https://offerletter.example/api/payu/return",
    });
    expect(fields.hash).toBe(payuRequestHash({ ...fields, udf1: "letter-1", udf2: "user-1" } as never, SALT));
  });

  it("never logs card details, the hash or the key", () => {
    const logged = loggableResponse(
      { mihpayid: "403993715", status: "success", txnid: "T", amount: "799.00", cardnum: "512345XXXXXX2346", name_on_card: "Anna", card_hash: "abc", hash: "h", key: "K", mode: "CC" },
      "webhook",
    );
    expect(logged).toMatchObject({ mihpayid: "403993715", status: "success", mode: "CC", received_from: "webhook" });
    for (const secret of ["cardnum", "name_on_card", "card_hash", "hash", "key"]) expect(logged).not.toHaveProperty(secret);
  });
});

describe("verify_payment", () => {
  it("maps PayU's status words, keeping anything unknown pending", () => {
    expect(mapPaymentStatus("success")).toBe("success");
    expect(mapPaymentStatus("Failure")).toBe("failure");
    expect(mapPaymentStatus("userCancelled")).toBe("failure");
    expect(mapPaymentStatus("Not Found")).toBe("not_found");
    expect(mapPaymentStatus("pending")).toBe("pending");
    expect(mapPaymentStatus("in progress")).toBe("pending");
    expect(mapPaymentStatus(undefined)).toBe("pending");
  });

  it("reads PayU's answer for the transaction", () => {
    const result = parseVerifyResponse(
      {
        status: 1,
        msg: "1 out of 1 Transactions Fetched Successfully",
        transaction_details: {
          "OLP-20261017-7Q4K2M": { mihpayid: "403993715", status: "success", unmappedstatus: "captured", mode: "CC", amt: "799.00", error_Message: "No Error", card_no: "512345XXXXXX2346" },
        },
      },
      "OLP-20261017-7Q4K2M",
    );
    expect(result).toMatchObject({ status: "success", amountMinor: 79900, mihpayid: "403993715", mode: "CC" });
    expect(result.raw).not.toHaveProperty("card_no");
  });

  it("treats PayU's 'Not Found' as no payment yet, and a missing transaction as an error", () => {
    const missing = parseVerifyResponse({ transaction_details: { T: { mihpayid: "Not Found", status: "Not Found" } } }, "T");
    expect(missing).toMatchObject({ status: "not_found", mihpayid: null, amountMinor: null });
    expect(() => parseVerifyResponse({ status: 0, msg: "0 out of 1 Transactions Fetched Successfully" }, "T")).toThrow();
    expect(() => parseVerifyResponse(null, "T")).toThrow();
  });
});
