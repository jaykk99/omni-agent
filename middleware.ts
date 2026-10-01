import { NextResponse, type NextRequest } from "next/server";
import { expectedGateToken } from "@/lib/gate-token";

const GATE_COOKIE = "omni_gate";

export async function middleware(request: NextRequest) {
  const isGateRoute = request.nextUrl.pathname.startsWith("/gate");
  const isGateApi = request.nextUrl.pathname.startsWith("/api/gate");
  const expectedPin = process.env.APP_PIN;

  if (expectedPin && !isGateRoute && !isGateApi) {
    const gateCookie = request.cookies.get(GATE_COOKIE)?.value;
    // The cookie holds an HMAC digest of the PIN (set by /api/gate), not the
    // PIN itself. Anyone holding an old raw-PIN cookie gets bounced to /gate
    // once and re-enters.
    const expected = await expectedGateToken();
    if (gateCookie !== expected) {
      const url = request.nextUrl.clone();
      url.pathname = "/gate";
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
