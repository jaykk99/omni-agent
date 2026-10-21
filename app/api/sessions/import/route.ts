import { getStore, type SessionExport } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Abuse caps: an export payload is user-supplied JSON, so bound it.
const MAX_MESSAGES = 2000;
const MAX_CONTENT_CHARS = 200_000;
const MAX_TITLE_CHARS = 200;

function isValidRole(role: unknown): role is string {
  return role === "user" || role === "assistant" || role === "notice";
}

/** POST /api/sessions/import — restore a chat from an export payload. */
export async function POST(request: Request) {
  const store = getStore();

  const body = (await request.json().catch(() => null)) as
    | Partial<SessionExport>
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, MAX_TITLE_CHARS)
      : "Imported chat";

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  if (rawMessages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Too many messages (max ${MAX_MESSAGES})` },
      { status: 400 }
    );
  }

  const messages: { role: string; content: string }[] = [];
  for (const m of rawMessages) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (!isValidRole(role) || typeof content !== "string" || !content.trim()) {
      continue;
    }
    messages.push({
      role,
      content: content.slice(0, MAX_CONTENT_CHARS),
    });
  }
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "No valid messages to import" },
      { status: 400 }
    );
  }

  try {
    const session = await store.importSession(title, messages);
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
