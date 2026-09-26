import { createClient } from "@/lib/supabase/server";
import { createBrowserSession } from "@/lib/browser";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const bb = await createBrowserSession();

    await supabase
      .from("chat_sessions")
      .update({
        browserbase_session_id: bb.sessionId,
        browserbase_connect_url: bb.connectUrl,
      })
      .eq("id", sessionId)
      .eq("user_id", auth.user.id);

    return NextResponse.json({
      sessionId: bb.sessionId,
      liveViewUrl: bb.liveViewUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start browser" },
      { status: 500 }
    );
  }
}
