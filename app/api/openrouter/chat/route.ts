import {
  apiKeyFromCookieHeader,
  hasServerKey,
  openRouterChat,
  type ChatMessage,
} from "@/lib/omniroute";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Plain chat for the /chat page: no sessions, no tools, no store. The
// client holds the conversation and sends the recent history each turn.
// The key is resolved server-side only: the owner's pasted key (httpOnly
// cookie, see /api/openrouter/key) wins over the server env key. No key →
// a plain 400 saying so; this route never falls back to the keyless demo
// model, because the page exists specifically for the OpenRouter path.

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are a helpful AI assistant. Answer in plain language and format " +
    "longer answers with Markdown: short headings, bullet lists, and fenced " +
    "code blocks with language tags.",
};

const MAX_MESSAGES = 100;
const MAX_CONTENT_CHARS = 20000;

type IncomingMessage = { role?: unknown; content?: unknown };

function validateMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) {
    return null;
  }
  const out: ChatMessage[] = [];
  for (const item of raw as IncomingMessage[]) {
    if (!item || typeof item !== "object") return null;
    if (item.role !== "user" && item.role !== "assistant") return null;
    if (typeof item.content !== "string" || !item.content.trim()) return null;
    out.push({
      role: item.role,
      content: item.content.slice(0, MAX_CONTENT_CHARS),
    });
  }
  return out;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messages = validateMessages(
    (body as { messages?: unknown } | null)?.messages
  );
  if (!messages) {
    return NextResponse.json(
      {
        error:
          "messages must be a non-empty array of { role: 'user' | 'assistant', content }.",
      },
      { status: 400 }
    );
  }
  const model = (body as { model?: unknown } | null)?.model;
  if (model !== undefined && typeof model !== "string") {
    return NextResponse.json(
      { error: "model must be a string" },
      { status: 400 }
    );
  }

  const sessionKey = apiKeyFromCookieHeader(request.headers.get("cookie"));
  if (!sessionKey && !hasServerKey()) {
    return NextResponse.json(
      {
        error:
          "No OpenRouter API key yet. Paste your key in the API key settings on this page, or set OPENROUTER_API_KEY on the server.",
      },
      { status: 400 }
    );
  }

  try {
    const reply = await openRouterChat([SYSTEM_PROMPT, ...messages], {
      model: typeof model === "string" ? model : undefined,
      apiKey: sessionKey,
    });
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "The model gateway failed — try again in a moment.",
      },
      { status: 502 }
    );
  }
}
