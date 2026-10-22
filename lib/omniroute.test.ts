import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiKeyFromCookieHeader,
  chatCompletion,
  defaultOpenRouterModel,
  getOpenRouterModels,
  getServerKeyMasked,
  hasServerKey,
  isGatewayConfigured,
  isPlausibleApiKey,
  keylessChat,
  maskApiKey,
  openRouterChat,
  parseOpenRouterModels,
  type ChatMessage,
} from "./omniroute";

// The keyless chat path is the app's default mode (no gateway key), so its
// message-folding and retry logic is worth pinning down. fetch is stubbed;
// nothing here touches the network.

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function chatBody(text: string) {
  return { choices: [{ message: { content: text } }] };
}

describe("isGatewayConfigured / chatCompletion without a key", () => {
  it("reports the key state honestly", () => {
    // No OMNIROUTE_API_KEY / OPENROUTER_API_KEY in the test env.
    expect(isGatewayConfigured()).toBe(false);
  });

  it("chatCompletion refuses to call without a gateway key", async () => {
    await expect(chatCompletion([{ role: "user", content: "hi" }])).rejects.toThrow(
      /No gateway key configured/
    );
  });
});

describe("keylessChat message folding", () => {
  it("folds the system prompt into the first user message", async () => {
    let sentBody: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return okJson(chatBody("folded ok"));
      })
    );

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a test assistant." },
      { role: "user", content: "hello" },
    ];
    const reply = await keylessChat(messages);
    expect(reply).toBe("folded ok");
    expect(sentBody).not.toBeNull();
    const roles = sentBody!.messages.map((m) => m.role);
    expect(roles).not.toContain("system");
    expect(roles).toEqual(["user"]);
    expect(sentBody!.messages[0].content).toContain(
      "You are a test assistant."
    );
    expect(sentBody!.messages[0].content).toContain("hello");
  });

  it("turns tool results into user text and skips tool-call shells", async () => {
    let sentBody: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return okJson(chatBody("tool ok"));
      })
    );

    const messages: ChatMessage[] = [
      { role: "user", content: "run ls" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "1", type: "function", function: { name: "terminal_action", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "1", name: "terminal_action", content: "file.txt" },
    ];
    const reply = await keylessChat(messages);
    expect(reply).toBe("tool ok");
    const contents = sentBody!.messages.map((m) => m.content);
    expect(contents).toEqual(["run ls", "[Tool result]\nfile.txt"]);
  });

  it("uses the system prompt alone when there is no user message", async () => {
    let sentBody: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return okJson(chatBody("sys only ok"));
      })
    );

    const reply = await keylessChat([
      { role: "system", content: "Be brief." },
    ]);
    expect(reply).toBe("sys only ok");
    expect(sentBody!.messages).toHaveLength(1);
    expect(sentBody!.messages[0].content).toContain("Be brief.");
  });

  it("throws on an empty prompt", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      keylessChat([
        { role: "system", content: "" },
        { role: "assistant", content: "" },
      ])
    ).rejects.toThrow(/empty prompt/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("keylessChat retry and fallback", () => {
  it("retries POST once after a transient failure", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return new Response("boom", { status: 500 });
        return okJson(chatBody("recovered"));
      })
    );

    const reply = await keylessChat([{ role: "user", content: "hi" }]);
    expect(reply).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("treats anonymous-tier budget apologies as failures, then uses GET fallback", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(String(url));
        if (init?.method === "POST") {
          return okJson(
            chatBody("Sorry, you have exceeded your budget. Come back later.")
          );
        }
        return new Response("get fallback answer", { status: 200 });
      })
    );

    const reply = await keylessChat([{ role: "user", content: "hi" }]);
    expect(reply).toBe("get fallback answer");
    expect(urls.filter((u) => u.includes("openai")).length).toBeGreaterThan(1);
  });

  it("throws an honest error when every path fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    await expect(
      keylessChat([{ role: "user", content: "hi" }])
    ).rejects.toThrow(/Keyless chat failed/);
  }, 30000);
});

describe("OpenRouter model list for the /chat page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses an OPENROUTER_MODELS value: trims, dedupes, drops empties", () => {
    expect(parseOpenRouterModels(" a/b ,c/d,, a/b , ")).toEqual([
      { id: "a/b", label: "a/b" },
      { id: "c/d", label: "c/d" },
    ]);
    expect(parseOpenRouterModels("")).toEqual([]);
    expect(parseOpenRouterModels(null)).toEqual([]);
    expect(parseOpenRouterModels(undefined)).toEqual([]);
  });

  it("falls back to the curated defaults when the env is unset", () => {
    const models = getOpenRouterModels();
    expect(models.length).toBeGreaterThanOrEqual(5);
    for (const m of models) {
      expect(m.id).toContain("/");
      expect(m.label.length).toBeGreaterThan(0);
    }
    expect(defaultOpenRouterModel()).toBe(models[0].id);
  });

  it("prefers OPENROUTER_MODELS over the defaults", () => {
    vi.stubEnv("OPENROUTER_MODELS", "x/one, y/two");
    expect(getOpenRouterModels()).toEqual([
      { id: "x/one", label: "x/one" },
      { id: "y/two", label: "y/two" },
    ]);
    expect(defaultOpenRouterModel()).toBe("x/one");
  });
});

describe("API key handling (masking, cookie, shape)", () => {
  it("masks keys so the full value never renders back", () => {
    const key = "sk-or-v1-abcdef1234567890";
    const masked = maskApiKey(key);
    expect(masked).toBe("sk-••••7890");
    expect(masked).not.toContain("abcdef");
    expect(maskApiKey("short")).toBe("••••");
    expect(maskApiKey("  sk-or-v1-abcdef1234567890  ")).toBe("sk-••••7890");
  });

  it("reports no server key in the test env", () => {
    expect(hasServerKey()).toBe(false);
    expect(getServerKeyMasked()).toBeNull();
  });

  it("reads the pasted-key cookie out of a raw Cookie header", () => {
    expect(apiKeyFromCookieHeader(null)).toBeUndefined();
    expect(apiKeyFromCookieHeader("omni_gate=abc")).toBeUndefined();
    expect(
      apiKeyFromCookieHeader(
        "omni_gate=abc; omni_openrouter_key=sk-or-test-1234; other=1"
      )
    ).toBe("sk-or-test-1234");
    expect(apiKeyFromCookieHeader("omni_openrouter_key=")).toBeUndefined();
    expect(
      apiKeyFromCookieHeader("omni_openrouter_key=sk%2Dor%2Dencoded")
    ).toBe("sk-or-encoded");
  });

  it("accepts plausible keys and rejects junk", () => {
    expect(isPlausibleApiKey("sk-or-v1-abcdef1234567890")).toBe(true);
    expect(isPlausibleApiKey("short")).toBe(false);
    expect(isPlausibleApiKey("has spaces init")).toBe(false);
    expect(isPlausibleApiKey("")).toBe(false);
    expect(isPlausibleApiKey(123456789)).toBe(false);
    expect(isPlausibleApiKey(null)).toBe(false);
  });
});

describe("openRouterChat (simple chat path)", () => {
  it("sends the per-request key and returns the reply", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    let sentBody: { model: string; messages: unknown[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrl = String(url);
        seenAuth = new Headers(init.headers).get("Authorization");
        sentBody = JSON.parse(init.body as string);
        return okJson(chatBody("hello from the model"));
      })
    );

    const reply = await openRouterChat(
      [{ role: "user", content: "hi" }],
      { model: "meta-llama/llama-3.3-70b-instruct", apiKey: "sk-or-per-request-key" }
    );
    expect(reply).toBe("hello from the model");
    expect(seenUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(seenAuth).toBe("Bearer sk-or-per-request-key");
    expect(sentBody!.model).toBe("meta-llama/llama-3.3-70b-instruct");
    expect(sentBody!.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("uses the configured default model when none is passed", async () => {
    let sentBody: { model: string } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return okJson(chatBody("default model reply"));
      })
    );
    const reply = await openRouterChat([{ role: "user", content: "hi" }], {
      apiKey: "sk-or-per-request-key",
    });
    expect(reply).toBe("default model reply");
    expect(sentBody!.model).toBe(defaultOpenRouterModel());
  });

  it("refuses to call without any key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      openRouterChat([{ role: "user", content: "hi" }])
    ).rejects.toThrow(/No OpenRouter key configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces gateway errors with their status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 }))
    );
    await expect(
      openRouterChat([{ role: "user", content: "hi" }], {
        apiKey: "sk-or-wrong-key",
      })
    ).rejects.toThrow(/Gateway error 401/);
  });

  it("throws on an empty model reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ choices: [{ message: { content: "  " } }] }))
    );
    await expect(
      openRouterChat([{ role: "user", content: "hi" }], {
        apiKey: "sk-or-per-request-key",
      })
    ).rejects.toThrow(/empty reply/);
  });
});
