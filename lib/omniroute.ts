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
      model: model || MODEL,
      messages,
      tools,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway error ${res.status}: ${text}`);
  }

  return res.json() as Promise<{
    choices: { message: ChatMessage; finish_reason: string }[];
  }>;
}
