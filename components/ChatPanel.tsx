"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Markdown from "@/components/Markdown";

export type Message = {
  id: string;
  role: string;
  content: string;
  /** Screenshot of where the browser ended up for this reply, if it browsed.
   *  Shown inline so navigation is visible even on mobile, where the
   *  browser pane sits behind its own tab. */
  screenshot?: string;
  /** Pages the agent visited while producing this reply. */
  visited?: string[];
  /** True when this message is a send-failure notice — renders a Retry button. */
  failed?: boolean;
};

const KEYLESS_SUGGESTIONS = [
  "Explain quantum computing like I'm five",
  "Write a haiku about debugging",
  "Help me plan a productive morning routine",
  "Draft a polite follow-up email",
];

const GATEWAY_SUGGESTIONS = [
  "Look up today's top story on Hacker News",
  "What's the current price of Bitcoin?",
  "Summarize the front page of en.wikipedia.org",
  "Write and run a quick Python script",
];

function TypingIndicator() {
  return (
    <div
      className="msg-in flex max-w-[85%] items-center gap-1.5 rounded-2xl rounded-bl-md bg-base-800 px-4 py-3"
      aria-label="Assistant is typing"
    >
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}

export default function ChatPanel({
  messages,
  onSend,
  sending,
  onRetry,
  keyless = false,
}: {
  messages: Message[];
  onSend: (text: string) => void;
  sending: boolean;
  /** Called when the user hits Retry on a failed message. */
  onRetry?: () => void;
  /** True when no model gateway key is configured — the empty state must not
   *  promise browsing/terminal powers that aren't available in this mode. */
  keyless?: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = keyless ? KEYLESS_SUGGESTIONS : GATEWAY_SUGGESTIONS;

  // Keep the view pinned to the newest message while the user is at (or near)
  // the bottom; leave them alone once they scroll up to read history.
  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    onSend(input.trim());
    setInput("");
    requestAnimationFrame(autosize);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
      >
        {messages.length === 0 && (
          <div className="msg-in mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-400 text-2xl shadow-lg shadow-accent-500/20">
              ✦
            </div>
            <h2 className="mb-1 text-lg font-semibold text-white">
              What can I help with?
            </h2>
            <p className="mb-6 max-w-sm text-sm text-neutral-400">
              {keyless ? (
                <>
                  Keyless demo mode — I&apos;ll answer from a free model.
                  Browsing and terminal tools unlock once a model key is
                  configured.
                </>
              ) : (
                <>
                  Ask anything — I can browse the web and run a terminal to get
                  things done.
                </>
              )}
            </p>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending}
                  onClick={() => onSend(s)}
                  className="rounded-xl border border-base-600 bg-base-800/60 px-3 py-2.5 text-left text-xs text-neutral-300 transition hover:border-accent-500/60 hover:bg-base-800 hover:text-white disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "notice" ? (
            <div
              key={m.id}
              className="msg-in mx-auto max-w-[95%] rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-center text-xs text-amber-300"
            >
              {m.content}
            </div>
          ) : (
            <div
              key={m.id}
              className={clsx(
                "msg-in max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[85%]",
                m.role === "user"
                  ? "ml-auto rounded-br-md bg-accent-500 text-white shadow-md shadow-accent-500/20"
                  : "rounded-bl-md bg-base-800 text-neutral-100"
              )}
            >
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap">{m.content}</div>
              ) : (
                <Markdown text={m.content} />
              )}
              {m.visited && m.visited.length > 0 && (
                <div className="mt-2 border-t border-base-700 pt-2 text-xs text-neutral-400">
                  <span className="font-medium text-neutral-300">Visited:</span>{" "}
                  {m.visited.map((u, i) => (
                    <span key={u + i}>
                      {i > 0 && " → "}
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-600 underline-offset-2 hover:text-white"
                      >
                        {u.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    </span>
                  ))}
                </div>
              )}
              {m.screenshot && (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL screenshot, next/image cannot optimize it
                <img
                  src={m.screenshot}
                  alt="Where the browser ended up"
                  className="mt-2 w-full rounded-lg border border-base-700"
                />
              )}
              {m.failed && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 rounded-lg bg-base-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-base-600"
                >
                  ↻ Retry
                </button>
              )}
            </div>
          )
        )}
        {sending && <TypingIndicator />}
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-t border-base-700 bg-base-950/80 p-3 backdrop-blur sm:p-4"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message Omni Agent…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-40 flex-1 resize-none rounded-xl border border-base-600 bg-base-800 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-accent-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-lg text-white shadow-md shadow-accent-500/25 transition hover:bg-accent-400 disabled:opacity-40 disabled:shadow-none"
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-neutral-600">
          {keyless
            ? "Keyless demo — answers come from a free model and may be limited."
            : "Omni Agent can browse the web and run terminal commands."}
        </p>
      </form>
    </div>
  );
}
