import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatCompletion,
  isGatewayConfigured,
  keylessChat,
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
