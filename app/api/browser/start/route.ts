import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreateSandbox, runInSandbox } from "@/lib/sandbox";
import { runBrowserActionInSandbox } from "@/lib/browser-sandbox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// A cold sandbox's first browser action installs playwright + chromium
// (roughly 30-90s) — give this route enough room to not time out on it.
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = createServiceClient();

  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("vercel_sandbox_id")
    .eq("id", sessionId)
    .single();

  try {
    const { sandbox, sandboxId, created } = await getOrCreateSandbox(
      session?.vercel_sandbox_id ?? null
    );
    if (created) {
      await supabase
        .from("chat_sessions")
        .update({ vercel_sandbox_id: sandboxId })
        .eq("id", sessionId);
    }

    // "read" with no navigation just brings the browser server up (if it
    // isn't already) and grabs a screenshot of its current/blank page, so
    // the pane has something to show as soon as the chat is opened rather
    // than waiting for the first real navigation.
    const result = await runBrowserActionInSandbox(sandbox, "read");

    // TEMP diagnostic (remove once the sandbox base image's shared-library
    // situation is confirmed): surfaces what's actually available in the
    // sandbox so a missing-library launch failure can be root-caused
    // instead of guessed at.
    let diag: string | undefined;
    if (result.error) {
      const probe = await runInSandbox(
        sandbox,
        "cat /etc/os-release 2>&1; echo ---LIBS---; ldconfig -p 2>&1 | grep -iE 'nss|nspr|atk|cups|gtk|pango|cairo|x11|dbus|expat|drm|gbm'; echo ---PKGMGR---; which apk dnf yum tdnf zypper apt apt-get 2>&1; echo ---ARCH---; uname -m"
      );
      diag = `${probe.stdout}\n${probe.stderr}`.slice(0, 4000);
    }

    return NextResponse.json({
      sandboxId,
      screenshotDataUrl: result.screenshotDataUrl,
      error: result.error,
      diag,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start browser" },
      { status: 500 }
    );
  }
}
