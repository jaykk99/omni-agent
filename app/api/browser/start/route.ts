import { getStore } from "@/lib/store";
import { getOrCreateSandbox } from "@/lib/sandbox";
import { runBrowserActionInSandbox } from "@/lib/browser-sandbox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// A cold sandbox's first browser action installs playwright + chromium
// (roughly 30-90s) — give this route enough room to not time out on it.
export const maxDuration = 300;

export async function POST(request: Request) {
  const store = getStore();

  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const session = await store.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { sandbox, sandboxId, created } = await getOrCreateSandbox(
      session.vercel_sandbox_id ?? null
    );
    if (created) {
      await store.setSandboxId(sessionId, sandboxId);
    }

    // "read" with no navigation just brings the browser server up (if it
    // isn't already) and grabs a screenshot of its current/blank page, so
    // the pane has something to show as soon as the chat is opened rather
    // than waiting for the first real navigation.
    const result = await runBrowserActionInSandbox(sandbox, "read");

    return NextResponse.json({
      sandboxId,
      screenshotDataUrl: result.screenshotDataUrl,
      error: result.error,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start browser" },
      { status: 500 }
    );
  }
}
