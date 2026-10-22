import { defaultOpenRouterModel, getOpenRouterModels } from "@/lib/omniroute";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The /chat page's model picker list. Ids come from OPENROUTER_MODELS when
// set, else the curated defaults in lib/omniroute.ts (all verified against
// the live OpenRouter catalog).
export async function GET() {
  return NextResponse.json({
    models: getOpenRouterModels(),
    defaultModel: defaultOpenRouterModel(),
  });
}
