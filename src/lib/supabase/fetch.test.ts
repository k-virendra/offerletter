import { afterEach, describe, expect, it, vi } from "vitest";
import { resilientFetch } from "./fetch";

afterEach(() => vi.unstubAllGlobals());

const responses = (...statuses: (number | Error)[]) => {
  const mock = vi.fn(async () => {
    const next = statuses.shift();
    if (next instanceof Error) throw next;
    return new Response(null, { status: next ?? 200 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

describe("resilientFetch", () => {
  it("tries a read once more after a gateway error or a dropped connection", async () => {
    const mock = responses(502, 200);
    expect((await resilientFetch("http://db.test/rest/v1/profiles")).status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);

    const dropped = responses(new TypeError("fetch failed"), 200);
    expect((await resilientFetch("http://db.test/rest/v1/profiles", { method: "GET" })).status).toBe(200);
    expect(dropped).toHaveBeenCalledTimes(2);
  });

  it("doesn't wait twice for a timeout", async () => {
    const timeout = responses(504, 200);
    expect((await resilientFetch("http://db.test/auth/v1/user")).status).toBe(504);
    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it("never repeats a write, and returns real answers as they are", async () => {
    const write = responses(502);
    expect((await resilientFetch("http://db.test/rest/v1/payments", { method: "POST", body: "{}" })).status).toBe(502);
    expect(write).toHaveBeenCalledTimes(1);

    const missing = responses(404);
    expect((await resilientFetch("http://db.test/rest/v1/profiles")).status).toBe(404);
    expect(missing).toHaveBeenCalledTimes(1);
  });
});
