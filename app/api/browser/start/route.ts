import { createServiceClient } from "@/lib/supabase/server";
import { createBrowserSession } from "@/lib/browser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createServiceClient();

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
      .eq("id", sessionId);

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
