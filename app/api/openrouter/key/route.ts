import {
  OPENROUTER_KEY_COOKIE,
  apiKeyFromCookieHeader,
  getServerKeyMasked,
  isPlausibleApiKey,
  maskApiKey,
} from "@/lib/omniroute";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The owner's pasted OpenRouter key lives ONLY in an httpOnly cookie (the
// same pattern as the PIN gate cookie): the browser sends it back per
// request, the chat route reads it server-side, and it is used for that
// browser's requests only. It is never stored server-side, never logged,
// and never returned in full — every response below carries the masked
// form only. A pasted key overrides the server env key for this browser.

// GET: which key (if any) would serve this browser, masked.
export async function GET(request: Request) {
  const sessionKey = apiKeyFromCookieHeader(request.headers.get("cookie"));
  const envMasked = getServerKeyMasked();
  return NextResponse.json({
    source: sessionKey ? "session" : envMasked ? "env" : null,
    sessionKeyMasked: sessionKey ? maskApiKey(sessionKey) : null,
    envKeyMasked: envMasked,
  });
}

// POST { apiKey }: save the pasted key to the httpOnly cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const apiKey = (body as { apiKey?: unknown } | null)?.apiKey;
  if (!isPlausibleApiKey(apiKey)) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like an API key — paste the full key with no spaces.",
      },
      { status: 400 }
    );
  }
  const key = apiKey.trim();
  const res = NextResponse.json({ ok: true, masked: maskApiKey(key) });
  res.cookies.set(OPENROUTER_KEY_COOKIE, key, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// DELETE: forget this browser's pasted key (falls back to the env key).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPENROUTER_KEY_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
