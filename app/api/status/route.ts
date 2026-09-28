import { isDatabaseConfigured } from "@/lib/store";
import { isGatewayConfigured } from "@/lib/omniroute";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Capability report the UI reads on load so it can say plainly what's
// working and what isn't (keyless mode), instead of failing silently.
export async function GET() {
  return NextResponse.json({
    database: isDatabaseConfigured(),
    gateway: isGatewayConfigured(),
    pin: !!process.env.APP_PIN,
  });
}
