import { isDatabaseConfigured } from "@/lib/store";
import { isGatewayConfigured } from "@/lib/omniroute";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Capability report the UI reads on load so it can say plainly what's
// working and what isn't (keyless mode), instead of failing silently.
// Every field reflects actual configuration state — nothing is inferred or
// probed, so "true" always means "configured", never "verified working".
export async function GET() {
  const database = isDatabaseConfigured();
  const gateway = isGatewayConfigured();
  return NextResponse.json({
    database,
    gateway,
    pin: !!process.env.APP_PIN,
    mode: gateway ? "gateway" : "keyless",
    // The live browser + terminal tools only run in the gateway path (they
    // need a function-calling model); keyless chat is plain conversation.
    capabilities: {
      chat: true,
      keyless_chat: true,
      browser: gateway,
      terminal: gateway,
    },
    persistence: database
      ? "supabase"
      : "memory (chats can reset when the serverless instance recycles)",
  });
}
