import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MIN_QUERY = 2;
const MAX_RESULTS = 30;

/** GET /api/search?q=<text> — case-insensitive substring search over all
 *  message content, newest matches first. */
export async function GET(request: Request) {
  const store = getStore();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) {
    return NextResponse.json(
      { error: `Query must be at least ${MIN_QUERY} characters` },
      { status: 400 }
    );
  }

  try {
    const hits = await store.searchMessages(q, MAX_RESULTS);
    return NextResponse.json({ hits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
