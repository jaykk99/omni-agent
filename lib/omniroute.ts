// Thin client for the "OmniRoute" gateway. OmniRoute itself runs as a local
// dev router; in production this hits OpenRouter (OPENROUTER_API_KEY), which
// gives the same multi-provider auto-fallback behavior from a hosted API.
// Swap OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY in if a hosted OmniRoute
// endpoint becomes available later — the call shape is OpenAI-compatible.

const BASE_URL =
  process.env.OMNIROUTE_BASE_URL?.replace(/\/$/, "") ??
  "https://openrouter.ai/api/v1";

const API_KEY = process.env.OMNIROUTE_API_KEY ?? process.env.OPENROUTER_API_KEY;

const MODEL = process.env.OMNIROUTE_MODEL ?? "anthropic/claude-3.5-sonnet";

/** True when a configured model gateway exists (no new keys needed to check). */
export function isGatewayConfigured(): boolean {
  return !!API_KEY;
}

/** The UI sends tier names ("fast"/"strong") for the error-inbox LLM pool.
 *  Against plain OpenRouter those names are invalid model ids, so map them
 *  to real ones instead of letting the gateway 404. */
function resolveModel(model?: string): string {
  const m = model || MODEL;
  if (
    (m === "fast" || m === "strong") &&
    BASE_URL === "https://openrouter.ai/api/v1"
  ) {
    // openai/gpt-oss-20b is the recommended free/cheap default.
    return m === "fast" ? "openai/gpt-oss-20b" : "anthropic/claude-3.5-sonnet";
  }
  return m;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  model?: string
) {
  if (!API_KEY) {
    throw new Error(
      "No gateway key configured. Set OMNIROUTE_API_KEY or OPENROUTER_API_KEY."
    );
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://omni-agent.vercel.app",
      "X-Title": "Omni Agent",
    },
    body: JSON.stringify({
      model: resolveModel(model),
      messages,
      tools,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway error ${res.status}: ${text.slice(0, 500)}`);
  }

  return res.json() as Promise<{
    choices: { message: ChatMessage; finish_reason: string }[];
  }>;
}

// KEYLESS-FIRST fallback: a free, no-signup chat endpoint (Pollinations'
// legacy anonymous tier) used when no gateway key is configured, or when
// the configured gateway fails. Best-effort by nature — the anonymous tier
// is rate/budget-limited and flaps — so we try POST, retry, then the plain
// GET endpoint, and throw an honest error if all fail. No tools here, so
// the chat route calls this directly as a single-turn responder.
// NOTE: verified 2026-09-28: on this endpoint ONLY model "openai-fast"
// answers reliably, "temperature"/"private" params and role:"system"
// messages 500 (their ENOSPC bug), so we send the bare minimum.
const KEYLESS_URL =
  process.env.KEYLESS_CHAT_URL?.replace(/\/$/, "") ??
  "https://text.pollinations.ai/openai";
const KEYLESS_MODEL = process.env.KEYLESS_CHAT_MODEL ?? "openai-fast";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseOpenAIChat(json: unknown): string | null {
  const text = (json as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  // Anonymous-tier budget errors come back as 200 with an apology body —
  // treat those as failures so the caller can retry/fall through.
  if (/budget|rate limit|too many requests/i.test(text)) return null;
  return text;
}

async function keylessPost(
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    try {
      const res = await fetch(KEYLESS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: KEYLESS_MODEL, messages }),
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = parseOpenAIChat(await res.json());
      if (text) return text;
      lastErr = new Error("empty or budget-limited response");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("keyless POST failed");
}

async function keylessGet(prompt: string): Promise<string> {
  // Plain GET form of the same endpoint — shorter prompts only, so this is
  // the last resort with just the latest user message. (Skipped when a
  // custom KEYLESS_CHAT_URL is set, since that override is POST-only.)
  if (process.env.KEYLESS_CHAT_URL) throw new Error("no GET fallback for custom keyless URL");
  const url = `https://text.pollinations.ai/${encodeURIComponent(
    prompt.slice(0, 600)
  )}?model=${KEYLESS_MODEL}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`GET fallback HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!text || /budget|rate limit|too many requests/i.test(text)) {
    throw new Error("GET fallback returned no usable text");
  }
  return text;
}

export async function keylessChat(messages: ChatMessage[]): Promise<string> {
  // Pollinations speaks OpenAI chat shape but (a) has no tool roles and
  // (b) 500s on any message with role "system" (their bug, verified
  // 2026-09-28) — fold system/tool traffic into plain user text instead.
  let systemPrefix = "";
  const clean: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      const c = typeof m.content === "string" ? m.content : "";
      if (c) systemPrefix += (systemPrefix ? "\n\n" : "") + c;
      continue;
    }
    if (m.role === "tool") {
      const c = typeof m.content === "string" ? m.content : "";
      if (c) clean.push({ role: "user", content: `[Tool result]\n${c}` });
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = typeof m.content === "string" ? m.content : "";
    if (!content && m.tool_calls?.length) continue; // tool-call shell, nothing to say
    if (!content) continue;
    clean.push({ role: m.role, content });
  }
  if (systemPrefix) {
    const firstUser = clean.findIndex((m) => m.role === "user");
    const injected = `[Instructions]\n${systemPrefix}`;
    if (firstUser >= 0) {
      clean[firstUser] = {
        role: "user",
        content: `${injected}\n\n${clean[firstUser].content}`,
      };
    } else {
      clean.unshift({ role: "user", content: injected });
    }
  }
  if (clean.length === 0) throw new Error("Keyless chat got an empty prompt");

  try {
    return await keylessPost(clean);
  } catch (postErr) {
    // Last resort: the GET form with just the newest user message.
    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    if (lastUser) {
      try {
        return await keylessGet(lastUser.content);
      } catch {
        // fall through to the combined error below
      }
    }
    throw new Error(
      `Keyless chat failed (${postErr instanceof Error ? postErr.message : "unknown error"})`
    );
  }
}
