import { NextResponse } from "next/server";

const COOKIE_NAME = "omni_gate";

export async function POST(request: Request) {
  const { pin } = await request.json().catch(() => ({ pin: "" }));
  const expected = process.env.APP_PIN;

  if (!expected) {
    return NextResponse.json(
      { error: "APP_PIN is not configured" },
      { status: 500 }
    );
  }

  if (pin !== expected) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, expected, {
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
