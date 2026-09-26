import { NextResponse, type NextRequest } from "next/server";

const GATE_COOKIE = "omni_gate";

export function middleware(request: NextRequest) {
  const isGateRoute = request.nextUrl.pathname.startsWith("/gate");
  const isGateApi = request.nextUrl.pathname.startsWith("/api/gate");
  const expectedPin = process.env.APP_PIN;

  if (expectedPin && !isGateRoute && !isGateApi) {
    const gateCookie = request.cookies.get(GATE_COOKIE)?.value;
    if (gateCookie !== expectedPin) {
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
