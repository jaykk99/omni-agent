import { createClient } from "@/lib/supabase/server";
import { chatCompletion, type ChatMessage, type ToolDefinition } from "@/lib/omniroute";
import { createBrowserSession, runBrowserAction } from "@/lib/browser";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Omni Agent, a helpful assistant with a real live browser you can drive. " +
    "Use the browser tool whenever the person asks about something on the web, needs current " +
    "information, or asks you to look something up, visit a site, or click through a page. " +
    "Narrate what you found in plain language rather than dumping raw page text. " +
    "If the browser tool errors, say so plainly instead of guessing.",
};

const BROWSER_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_action",
    description:
      "Drive the live browser pane shown to the user. Use 'goto' to open a URL, " +
      "'click' to click the first element matching visible text, 'back' to go back, " +
      "and 'read' to re-read the current page without navigating.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["goto", "click", "back", "read"] },
        value: {
          type: "string",
          description: "URL for 'goto', or visible text to click for 'click'. Omit for 'back'/'read'.",
        },
      },
      required: ["action"],
    },
  },
};

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, message } = await request.json();
  if (!sessionId || !message) {
    return NextResponse.json(
      { error: "sessionId and message are required" },
      { status: 400 }
    );
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: message,
  });

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const messages: ChatMessage[] = [
    SYSTEM_PROMPT,
    ...(history ?? []).map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
    })),
  ];

  let connectUrl = session.browserbase_connect_url as string | null;
  let browserbaseSessionId = session.browserbase_session_id as string | null;

  const events: { type: string; detail?: string }[] = [];

  for (let i = 0; i < 5; i++) {
    const completion = await chatCompletion(messages, [BROWSER_TOOL]);
    const choice = completion.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const finalText = assistantMessage.content ?? "";
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: finalText,
      });
      return NextResponse.json({ reply: finalText, events });
    }

    for (const call of assistantMessage.tool_calls) {
      let args: { action: string; value?: string } = { action: "read" };
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // fall through with default
      }

      let toolResultText: string;
      try {
        if (!connectUrl) {
          const bb = await createBrowserSession();
          connectUrl = bb.connectUrl;
          browserbaseSessionId = bb.sessionId;
          await supabase
            .from("chat_sessions")
            .update({
              browserbase_session_id: bb.sessionId,
              browserbase_connect_url: bb.connectUrl,
            })
            .eq("id", sessionId);
        }

        const result = await runBrowserAction(
          connectUrl,
          args.action as "goto" | "click" | "back" | "read",
          args.value
        );
        events.push({ type: "navigate", detail: result.url });
        toolResultText = JSON.stringify(result);
      } catch (err) {
        toolResultText = JSON.stringify({
          error: err instanceof Error ? err.message : "Browser action failed",
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: "browser_action",
        content: toolResultText,
      });
    }
  }

  const fallback =
    "I took several browser steps but couldn't wrap up cleanly — try rephrasing or asking again.";
  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: fallback,
  });
  return NextResponse.json({ reply: fallback, events });
}
