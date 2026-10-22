import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// Route tests for the simple-chat endpoint. The gateway fetch is stubbed;
// the key under test arrives the way the browser sends it — in the
// omni_openrouter_key cookie — and no env key exists in the test env.

const base = "http://localhost/api/openrouter/chat";
const KEY = "sk-or-v1-route-test-key-9876";

afterEach(() => {
  vi.unstubAllGlobals();
});

function postRequest(body: unknown, cookie?: string) {
  return new Request(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const oneMessage = { messages: [{ role: "user", content: "hi" }] };

describe("POST /api/openrouter/chat validation", () => {
  it("400s on a missing or empty messages array", async () => {
    expect((await POST(postRequest({}))).status).toBe(400);
    expect((await POST(postRequest({ messages: [] }))).status).toBe(400);
    expect((await POST(postRequest({ messages: "nope" }))).status).toBe(400);
  });

  it("400s on client-sent system roles and blank content", async () => {
    const withKey = `omni_openrouter_key=${KEY}`;
    expect(
      (
        await POST(
          postRequest(
            { messages: [{ role: "system", content: "sneaky" }] },
            withKey
          )
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest({ messages: [{ role: "user", content: "   " }] }, withKey)
        )
      ).status
    ).toBe(400);
  });

  it("400s when no key exists anywhere, and never calls the gateway", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(postRequest(oneMessage));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No OpenRouter API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/openrouter/chat with a pasted key", () => {
  it("answers using the cookie key", async () => {
    let seenAuth: string | null = null;
    let sentBody: { model: string; messages: { role: string }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seenAuth = new Headers(init.headers).get("Authorization");
        sentBody = JSON.parse(init.body as string);
        return okJson({ choices: [{ message: { content: "route reply" } }] });
      })
    );

    const res = await POST(
      postRequest(
        { ...oneMessage, model: "meta-llama/llama-3.3-70b-instruct" },
        `omni_openrouter_key=${KEY}`
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "route reply" });
    expect(seenAuth).toBe(`Bearer ${KEY}`);
    expect(sentBody!.model).toBe("meta-llama/llama-3.3-70b-instruct");
    // The server prepends its own system prompt ahead of the client history.
    expect(sentBody!.messages[0].role).toBe("system");
    expect(sentBody!.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("maps gateway failures to 502 with the gateway's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 }))
    );
    const res = await POST(
      postRequest(oneMessage, `omni_openrouter_key=${KEY}`)
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Gateway error 401/);
  });
});
