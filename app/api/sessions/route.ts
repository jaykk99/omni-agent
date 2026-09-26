import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data });
}

export async function POST(request: Request) {
  const supabase = createServiceClient();

  const body = await request.json().catch(() => ({}));
  const title = body?.title || "New chat";

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ title })
    .select("id, title, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data });
}
