import { NextResponse } from "next/server";
import { expectedGateToken } from "@/lib/gate-token";
import {
  clientIp,
  gateCheck,
  gateRecordFailure,
  gateClear,
} from "@/lib/rate-limit";

const COOKIE_NAME = "omni_gate";

function lockedResponse(retryAfterSec: number) {
  const res = NextResponse.json(
    {
      error: "Too many wrong PINs — try again later.",
      retryAfter: retryAfterSec,
    },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}

export async function POST(request: Request) {
  const expected = process.env.APP_PIN;

  if (!expected) {
    return NextResponse.json(
      { error: "APP_PIN is not configured — the app is running without a PIN gate" },
      { status: 400 }
    );
  }

  const ip = clientIp(request);
  const check = gateCheck(ip);
  if (!check.allowed) return lockedResponse(check.retryAfterSec);

  const { pin } = await request.json().catch(() => ({ pin: "" }));

  if (typeof pin !== "string" || pin !== expected) {
    // Same generic message either way — don't confirm whether a PIN exists.
    const recorded = gateRecordFailure(ip);
    if (recorded.locked) return lockedResponse(recorded.retryAfterSec);
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }

  gateClear(ip);
  // The cookie carries an HMAC of the PIN, never the PIN itself.
  const token = await expectedGateToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token ?? "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
