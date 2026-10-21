import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  try {
    const sessions = await store.listSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const store = getStore();

  const body = await request.json().catch(() => ({}));
  const title = body?.title || "New chat";

  try {
    const session = await store.createSession(title);
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const store = getStore();

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    await store.deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete session" },
      { status: 500 }
    );
  }
}

/** PATCH /api/sessions { id, title } — rename a chat from the sidebar. */
export async function PATCH(request: Request) {
  const store = getStore();

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const title =
    typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";

  if (!id || !title) {
    return NextResponse.json(
      { error: "id and a non-empty title are required" },
      { status: 400 }
    );
  }
  if (title.length > 120) {
    return NextResponse.json(
      { error: "title must be 120 characters or fewer" },
      { status: 400 }
    );
  }

  try {
    const session = await store.getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    await store.updateSessionTitle(id, title);
    return NextResponse.json({ ok: true, session: { ...session, title } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to rename session" },
      { status: 500 }
    );
  }
}
