import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getStore();

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const session = await store.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const messages = await store.listMessages(sessionId);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load messages" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/messages?sessionId=…&messageId=…          → delete one message
 * DELETE /api/messages?sessionId=…&truncateFrom=…      → delete that message
 *                                                        and everything after it
 * Powers per-message delete, edit-and-resend, and regenerate: the chat rewinds
 * to a point and the client sends the replacement text as a fresh message.
 */
export async function DELETE(request: Request) {
  const store = getStore();

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const messageId = searchParams.get("messageId");
  const truncateFrom = searchParams.get("truncateFrom");
  if (!sessionId || (!messageId && !truncateFrom)) {
    return NextResponse.json(
      { error: "sessionId plus messageId or truncateFrom required" },
      { status: 400 }
    );
  }

  try {
    const session = await store.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (truncateFrom) {
      await store.truncateMessages(sessionId, truncateFrom);
    } else {
      await store.deleteMessage(sessionId, messageId!);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Message not found") {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete message" },
      { status: 500 }
    );
  }
}
