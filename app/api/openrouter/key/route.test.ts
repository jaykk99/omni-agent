import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

// Route tests for the pasted-key cookie endpoints. No env key is configured
// in the test env, so envKeyMasked is null throughout. The one invariant
// that matters most: the full key must never appear in a response body —
// only its masked form. (The Set-Cookie header necessarily carries the key
// itself; it is httpOnly and never rendered.)

const base = "http://localhost/api/openrouter/key";
const KEY = "sk-or-v1-testkey1234567890";

afterEach(() => {
  vi.unstubAllGlobals();
});

function getRequest(cookie?: string) {
  return new Request(base, {
    headers: cookie ? { cookie } : {},
  });
}

function postRequest(body: unknown) {
  return new Request(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/openrouter/key", () => {
  it("reports no key when neither cookie nor env is set", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      source: null,
      sessionKeyMasked: null,
      envKeyMasked: null,
    });
  });

  it("reports the session key masked, never in full", async () => {
    const res = await GET(
      getRequest(`omni_gate=abc; omni_openrouter_key=${KEY}`)
    );
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.source).toBe("session");
    expect(body.sessionKeyMasked).toBe("sk-••••7890");
    expect(text).not.toContain(KEY);
  });
});

describe("POST /api/openrouter/key", () => {
  it("saves the key to an httpOnly cookie and answers masked only", async () => {
    const res = await POST(postRequest({ apiKey: KEY }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, masked: "sk-••••7890" });
    expect(text).not.toContain(KEY);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("omni_openrouter_key=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });

  it("rejects junk instead of storing it", async () => {
    for (const bad of [{}, { apiKey: "" }, { apiKey: "short" }, { apiKey: "has spaces in it" }, { apiKey: 42 }]) {
      const res = await POST(postRequest(bad));
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("DELETE /api/openrouter/key", () => {
  it("clears the cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("omni_openrouter_key=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
