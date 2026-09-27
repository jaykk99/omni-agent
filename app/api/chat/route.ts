import { createServiceClient } from "@/lib/supabase/server";
import { chatCompletion, type ChatMessage, type ToolDefinition } from "@/lib/omniroute";
import { runBrowserActionInSandbox } from "@/lib/browser-sandbox";
import { getOrCreateSandbox, runInSandbox } from "@/lib/sandbox";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Bumped from 60s: browser actions now run a real Chromium inside the
// sandbox (see lib/browser-sandbox.ts), and a cold sandbox's first browser
// action installs playwright + chromium there (roughly 30-90s).
export const maxDuration = 300;

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Omni Agent, a helpful assistant with a real live browser you can drive and a real " +
    "Linux terminal you can run commands in. " +
    "Use the browser tool whenever the person asks about something on the web, needs current " +
    "information, or asks you to look something up, visit a site, or click through a page. " +
    "Use the terminal tool whenever the person asks you to run a command, install a package, " +
    "write/execute code, or otherwise needs a real shell — it's a persistent Linux sandbox that " +
    "stays alive for this chat, so files and installed packages carry over between commands. " +
    "Narrate what you found in plain language rather than dumping raw page or terminal output. " +
    "If a tool errors, say so plainly instead of guessing.",
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

const TERMINAL_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "terminal_action",
    description:
      "Run a shell command in a persistent Linux sandbox scoped to this chat session. " +
      "Use it to install packages (npm, pip, apt-get, etc.), write and run scripts, inspect files, " +
      "or anything else that needs a real terminal. State (installed packages, files) persists " +
      "across calls within the same chat.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run, e.g. 'npm install lodash' or 'python3 script.py'.",
        },
      },
      required: ["command"],
    },
  },
};

export async function POST(request: Request) {
  const supabase = createServiceClient();

  const { sessionId, message, model } = await request.json();
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

  // Browser and terminal tools now share one sandbox per chat session
  // (session.browserbase_connect_url / browserbase_session_id are legacy —
  // left in the schema but no longer written to; see lib/browser-sandbox.ts
  // for why the browser moved off Browserbase).
  let sandboxId = session.vercel_sandbox_id as string | null;

  const events: { type: string; detail?: string }[] = [];

  // Real browsing tasks often take several steps (goto → click → read →
  // click...), so allow more than the original 5 before giving up.
  for (let i = 0; i < 8; i++) {
    let completion;
    try {
      completion = await chatCompletion(messages, [BROWSER_TOOL, TERMINAL_TOOL], model);
    } catch (err) {
      const reply =
        "The model gateway didn't respond in time — try again in a moment. " +
        (err instanceof Error ? `(${err.message})` : "");
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: reply,
      });
      return NextResponse.json({ reply, events });
    }
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
      if (call.function.name === "terminal_action") {
        let termArgs: { command: string } = { command: "" };
        try {
          termArgs = JSON.parse(call.function.arguments);
        } catch {
          // fall through with default
        }

        let toolResultText: string;
        try {
          const { sandbox, sandboxId: newId, created } = await getOrCreateSandbox(sandboxId);
          if (created) {
            sandboxId = newId;
            await supabase
              .from("chat_sessions")
              .update({ vercel_sandbox_id: newId })
              .eq("id", sessionId);
          }

          const result = await runInSandbox(sandbox, termArgs.command || "true");
          events.push({
            type: "terminal",
            detail: JSON.stringify({
              command: result.command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            }),
          });
          toolResultText = JSON.stringify(result);
        } catch (err) {
          toolResultText = JSON.stringify({
            error: err instanceof Error ? err.message : "Terminal action failed",
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: "terminal_action",
          content: toolResultText,
        });
        continue;
      }

      let args: { action: string; value?: string } = { action: "read" };
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // fall through with default
      }

      let toolResultText: string;
      try {
        const { sandbox, sandboxId: newId, created } = await getOrCreateSandbox(sandboxId);
        if (created) {
          sandboxId = newId;
          await supabase
            .from("chat_sessions")
            .update({ vercel_sandbox_id: newId })
            .eq("id", sessionId);
        }

        const result = await runBrowserActionInSandbox(
          sandbox,
          args.action as "goto" | "click" | "back" | "read",
          args.value
        );
        if (result.screenshotDataUrl) {
          events.push({ type: "screenshot", detail: result.screenshotDataUrl });
        }
        if (result.error) {
          events.push({ type: "navigate", detail: result.url || "error" });
          toolResultText = JSON.stringify({ error: result.error });
        } else {
          events.push({ type: "navigate", detail: result.url });
          toolResultText = JSON.stringify({ url: result.url, title: result.title, text: result.text });
        }
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
